import {
  type ChannelTask,
  type ChannelTaskWait,
  isQueuedAgentReply,
  type QueueDelivery,
  type QueueSnapshot,
} from "@robot/contracts/ipc";
import { markdownPreviewText } from "@robot/contracts/markdown-preview-text";
import type { AgentMessage, AgentProfile } from "@robot/ui/data";
import type { AwaitingReplyItem, AwaitingReplyState } from "@robot/ui/features/conversation/AwaitingReplies";
import type { SidebarAgentWait } from "@robot/ui/features/sidebar/sidebar-agent-states";
import { currentText } from "@robot/ui/text";

/**
 * The rows of the waiting block: which agents this agent asked, and where each answer is.
 *
 * All of it is in data the conversation has already. An outgoing exchange names each delivery and
 * its state, and an answer is a queued delivery from the agent that was asked, linked to the
 * question by `replyToMessageId`. A channel owner that waits has its sub-tasks in the page.
 */

const PREVIEW_LIMIT = 160;

export interface AgentAwaitingInput {
  messages: readonly AgentMessage[];
  queue: QueueSnapshot | undefined;
  agents: readonly AgentProfile[];
  /** The agent of this conversation. It reads each queued answer after its turn. */
  self: AgentProfile | undefined;
  /** What stops each agent in its own chat. An agent that was asked and waits shows the wait. */
  waits?: Record<string, SidebarAgentWait> | undefined;
}

export function agentAwaitingReplies(input: AgentAwaitingInput): AwaitingReplyItem[] {
  const { t } = currentText();
  const replies = (input.queue?.deliveries ?? []).filter(isQueuedAgentReply);
  const readsNext = input.self ? t("chat.awaiting.readsNext", { name: input.self.name }) : undefined;
  const rowFor = (agentId: string, state: AwaitingReplyState, id: string, reply?: QueueDelivery): AwaitingReplyItem => {
    const agent = input.agents.find((candidate) => candidate.id === agentId);
    return {
      id,
      agent,
      name: agent?.name ?? t("chat.activity.agentFallback"),
      state,
      ...(reply ? { preview: previewText(replyResult(reply.text)), detail: readsNext, deliveryId: reply.id } : {}),
    };
  };
  // A failed question stays until the person writes again: then they have seen it.
  const lastUserIndex = input.messages.findLastIndex((message) => message.author === "you");
  const rows: AwaitingReplyItem[] = [];
  const shownReplies = new Set<string>();
  input.messages.forEach((message, index) => {
    const exchange = message.exchange;
    if (exchange?.direction !== "outgoing" || exchange.expectsReply === false) return;
    const firstRow = rows.length;
    for (const delivery of exchange.deliveries) {
      const reply = replies.find(
        (candidate) =>
          candidate.replyToMessageId === exchange.messageId &&
          candidate.sender.kind === "agent" &&
          candidate.sender.agentId === delivery.recipientAgentId,
      );
      const id = `${exchange.messageId}:${delivery.recipientAgentId}`;
      if (reply) {
        shownReplies.add(reply.id);
        rows.push(rowFor(delivery.recipientAgentId, "replied", id, reply));
        continue;
      }
      const state = deliveryState(delivery.status);
      if (!state || (state === "failed" && index < lastUserIndex)) continue;
      const wait = state === "failed" ? undefined : input.waits?.[delivery.recipientAgentId];
      rows.push({ ...rowFor(delivery.recipientAgentId, state, id), ...(wait ? { wait } : {}) });
    }
    // The answers wait until every teammate of this request is done, so none is read next yet.
    const exchangeRows = rows.slice(firstRow);
    if (exchangeRows.some((row) => row.state === "asked" || row.state === "working")) {
      for (const row of exchangeRows) delete row.detail;
    }
  });
  // An answer to a question on an earlier page, or to one sent from another conversation.
  for (const reply of replies) {
    if (shownReplies.has(reply.id) || reply.sender.kind !== "agent") continue;
    rows.push(rowFor(reply.sender.agentId, "replied", reply.id, reply));
  }
  return rows;
}

/** Null for a delivery that has landed: its answer is in the transcript, or it had none. */
function deliveryState(status: QueueDelivery["status"]): Exclude<AwaitingReplyState, "replied"> | null {
  if (status === "queued") return "asked";
  if (status === "starting" || status === "running") return "working";
  if (status === "failed" || status === "interrupted" || status === "cancelled") return "failed";
  return null;
}

export interface ChannelAwaitingInput {
  tasks: readonly ChannelTask[];
  agents: readonly AgentProfile[];
  /** The name of a task owner, with the channel's own fallback for a task that has none. */
  name: (agentId: string | null) => string;
  /** What each queued task waits behind. Absent from a remote host. */
  waits?: Readonly<Record<string, ChannelTaskWait>> | undefined;
  /** The id of the channel on screen, so a wait for work in this channel does not name it. */
  channelId?: string | undefined;
}

/** The note under a queued task: whose work its owner does first, or that it is busy in its own chat. */
function waitDetail(wait: ChannelTaskWait, channelId: string | undefined): string {
  const { t } = currentText();
  if (wait.kind === "chat") return t("chat.awaiting.busyInChat");
  return wait.channelId === channelId
    ? t("chat.awaiting.busyHere", { instruction: wait.instruction })
    : t("chat.awaiting.busyInChannel", { channel: wait.channelName, instruction: wait.instruction });
}

/** The sub-tasks of each channel task that waits for them. */
export function channelAwaitingReplies(input: ChannelAwaitingInput): AwaitingReplyItem[] {
  const { t } = currentText();
  const waiting = new Map(input.tasks.filter((task) => task.state === "waiting").map((task) => [task.id, task]));
  return input.tasks.flatMap((task) => {
    const parent = task.parentTaskId ? waiting.get(task.parentTaskId) : undefined;
    const wait = task.state === "queued" ? input.waits?.[task.id] : undefined;
    // A queued task that waits behind other work of its owner has no row below a parent that waits.
    if (!parent && wait)
      return [
        {
          id: task.id,
          agent: input.agents.find((candidate) => candidate.id === task.ownerAgentId),
          name: input.name(task.ownerAgentId),
          state: "asked" as const,
          preview: previewText(task.instruction),
          detail: waitDetail(wait, input.channelId),
        },
      ];
    if (!parent) return [];
    const state = channelTaskState(task.state);
    if (!state) return [];
    return [
      {
        id: task.id,
        agent: input.agents.find((candidate) => candidate.id === task.ownerAgentId),
        name: input.name(task.ownerAgentId),
        state,
        preview: previewText(task.instruction),
        ...(state === "replied" && parent.ownerAgentId
          ? { detail: t("chat.awaiting.readsNext", { name: input.name(parent.ownerAgentId) }) }
          : wait
            ? { detail: waitDetail(wait, input.channelId) }
            : {}),
      },
    ];
  });
}

function channelTaskState(state: ChannelTask["state"]): AwaitingReplyState | null {
  // A paused sub-task shows in the stopped tasks with Resume. It did not fail.
  if (state === "paused") return null;
  if (state === "queued") return "asked";
  if (state === "running" || state === "waiting") return "working";
  if (state === "completed") return "replied";
  return "failed";
}

/**
 * The `Result:` part of a reply in the relay format (`Status:`, `Result:`, `Evidence:` lines, from
 * `delivery-content.ts`). A reply in another form is shown whole.
 */
function replyResult(text: string): string {
  const result = /^\s*Result:[ \t]*(.*?)(?=^\s*Evidence:|(?![\s\S]))/imsu.exec(text)?.[1]?.trim();
  return result || text;
}

function previewText(text: string): string {
  return markdownPreviewText(text).slice(0, PREVIEW_LIMIT);
}
