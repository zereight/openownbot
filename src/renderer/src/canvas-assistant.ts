/**
 * The chat over a canvas. A request goes into the open agent's own conversation, where the agent
 * changes the canvas with its tools; its answer comes back when the turn that read the request
 * ends. The panel shows only the exchange started here: the whole conversation stays on the Agents
 * tab. The routine canvas and the Workflows page both use it.
 */

import { latestTurnAnswer } from "@robot/contracts/ipc";
import { toast } from "@robot/ui";
import type { DiagramChatMessage } from "@robot/ui/features/diagrams/diagram-model";
import { useText } from "@robot/ui/text";
import { createEffect, createMemo, createStore, onSettled } from "solid-js";
import type { AgentChatPort } from "./agent-chat-port";

/** A request sent and not answered yet. `deliveryId` names the request in the conversation. */
interface PendingRequest {
  agentId: string;
  deliveryId: string | null;
}

export interface CanvasAssistantOptions {
  /** Called when the user sends. The request goes out when the promise ends; a rejection ends it with the failure toast. */
  prepare?: (() => Promise<void>) | undefined;
  /** The text the agent gets for what the user typed. The panel always shows the typed text. */
  compose?: ((typed: string) => string) | undefined;
  /** What the exchange in the panel is about. When it changes, the panel drops the exchange, as for another agent. */
  scope?: (() => string | null | undefined) | undefined;
}

export function createCanvasAssistant(
  port: () => AgentChatPort,
  agentId: () => string | null,
  options: CanvasAssistantOptions = {},
) {
  const { t, errorMessage } = useText();
  const [chat, setChat] = createStore<{ messages: DiagramChatMessage[]; pending: PendingRequest | null }>({
    messages: [],
    pending: null,
  });

  // The memo stops a new value that is the same: an effect runs on each change of what its compute
  // function reads, as a read of the open workflow gives a new object, also for the same workflow.
  const exchangeOf = createMemo(() => `${agentId() ?? ""}\u0000${options.scope?.() ?? ""}`);
  createEffect(exchangeOf, () => {
    setChat((draft) => {
      draft.messages = [];
      draft.pending = null;
    });
  });

  /**
   * Looks at the request in the conversation, around its own message, whenever a turn of the agent
   * ends or its queue moves. A request still in the queue takes no answer: the turn that ended read
   * other work. A request whose delivery failed or was cancelled ends with an error, and one whose
   * turn ended shows that turn's answer, or ends without one.
   */
  const check = async (forAgent: string, endedTurnId: string | null) => {
    const pending = chat.pending;
    if (!pending?.deliveryId || pending.agentId !== forAgent) return;
    const page = await port().conversation.page(forAgent, pending.deliveryId);
    const index = page.messages.findIndex((message) => message.id === pending.deliveryId);
    const asked = page.messages[index];
    if (!asked || chat.pending !== pending) return;
    const status = asked.delivery?.status ?? (asked.turnId ? "completed" : "queued");
    if (status === "queued") return;
    if (status === "failed" || status === "cancelled" || status === "interrupted") {
      toast.error(t("diagram.chat.failed"));
      setChat((draft) => {
        draft.pending = null;
      });
      return;
    }
    const turnId = asked.turnId ?? endedTurnId;
    let reply = turnId ? latestTurnAnswer(page.messages.slice(index + 1), turnId) : undefined;
    // The answer is the last message of the turn, and a long turn ends past the page around the
    // request, which can hold only an earlier message of it. Once the turn has ended, the newest
    // page holds its end, so its answer there wins.
    if (turnId && status === "completed") {
      const latest = await port().conversation.page(forAgent);
      if (chat.pending !== pending) return;
      reply = latestTurnAnswer(latest.messages, turnId) ?? reply;
    }
    // Without the turn, a queue change can come before the answer does: only an ended turn ends it.
    if (!reply && (status !== "completed" || !turnId)) return;
    setChat((draft) => {
      // An ended turn and its queue change check at the same time; only the first answers.
      if (draft.pending?.deliveryId !== pending.deliveryId) return;
      if (reply) draft.messages.push({ id: reply.id, author: "agent", text: reply.text, createdAt: reply.createdAt });
      draft.pending = null;
    });
  };

  onSettled(() =>
    port().onEvent((event) => {
      const ended =
        event.type === "turn-completed"
          ? { agentId: event.agentId, turnId: event.turnId }
          : event.type === "queue-changed"
            ? { agentId: event.snapshot.agentId, turnId: null }
            : null;
      if (ended)
        check(ended.agentId, ended.turnId).catch((error) =>
          toast.error(errorMessage(error, t("diagram.chat.failed")), { error }),
        );
    }),
  );

  const send = (text: string) => {
    const id = agentId();
    if (!id || chat.pending) return;
    const clientMessageId = crypto.randomUUID();
    const pending: PendingRequest = { agentId: id, deliveryId: null };
    // Both run in the step of the click, so the request names what the user saw when they pressed
    // send, also when the wait for `prepare` is long.
    const body = options.compose?.(text) ?? text;
    const ready = options.prepare?.() ?? Promise.resolve();
    setChat((draft) => {
      draft.messages.push({ id: clientMessageId, author: "user", text, createdAt: new Date().toISOString() });
      draft.pending = pending;
    });
    ready
      .then(() => port().conversation.send({ agentId: id, text: body, clientMessageId }))
      .then((deliveryId) => {
        setChat((draft) => {
          if (draft.pending?.agentId !== id || draft.pending.deliveryId) return;
          if (deliveryId) draft.pending.deliveryId = deliveryId;
          else draft.pending = null;
        });
      })
      .catch((error) => {
        toast.error(errorMessage(error, t("diagram.chat.failed")), { error });
        setChat((draft) => {
          draft.pending = null;
        });
      });
  };

  return {
    messages: () => chat.messages,
    working: () => chat.pending !== null,
    send,
  };
}
