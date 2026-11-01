import type { AgentApproval, ChannelPage, ChannelTask, ChannelThread } from "@robot/contracts/ipc";
import type { AgentProfile } from "@robot/ui/data";
import type { ShellAgentState, ShellMember, ShellPlanStep } from "@robot/ui/features/shell/shell-types";
import { channelApproval, waitingChannelPrompt } from "./channel-conversation-rows";

/** How much of a task's instruction the member panel shows as the agent's step. */
const STEP_LENGTH = 80;
/** How much of a part's instruction its checklist line shows. */
const PLAN_STEP_LENGTH = 48;
/** The checklist lines of one agent. A longer plan shows its first parts. */
const PLAN_LIMIT = 8;
const ACTIVE_STATES: ReadonlySet<ChannelTask["state"]> = new Set(["queued", "running", "waiting"]);

/**
 * The members of the open channel with what each one does now. A wait comes first, because it needs
 * the reader; then the running task; then the agent's newest task when it failed. A member that the
 * host no longer has is left out: the settings pane lists it so that the user can remove it.
 */
export function channelMembers(input: {
  page: ChannelPage;
  threads: readonly ChannelThread[] | undefined;
  approvals: readonly AgentApproval[];
  agents: readonly AgentProfile[];
  /** The reader's text for a failure that the host stored as English source text. */
  failure: (error: string) => string;
}): ShellMember[] {
  const approval = channelApproval(input.page, input.threads, input.approvals);
  const asking = waitingChannelPrompt(input.page)?.entry.author.id;
  const agents = new Map(input.agents.map((agent) => [agent.id, agent]));
  return input.page.channel.members.flatMap((member) => {
    const agent = agents.get(member.agentId);
    if (!agent) return [];
    const state = memberState(input.page, agent.id, approval, asking);
    return [
      {
        agent,
        state: state.kind === "failed" ? { ...state, reason: input.failure(state.reason) } : state,
        plan: memberPlan(input.page, agent.id),
      },
    ];
  });
}

function memberState(
  page: ChannelPage,
  agentId: string,
  approval: AgentApproval | undefined,
  asking: string | undefined,
): ShellAgentState {
  if (approval?.agentId === agentId)
    return { kind: "waiting", reason: "approval", detail: approval.command ?? approval.reason };
  if (asking === agentId) return { kind: "waiting", reason: "answer", detail: null };
  const tasks = page.tasks.filter((task) => task.ownerAgentId === agentId);
  const running = tasks.findLast((task) => task.state === "running");
  if (running) return { kind: "working", step: step(running.instruction) };
  const newest = tasks.at(-1);
  if (newest?.state === "failed" && newest.error) return { kind: "failed", reason: newest.error };
  return { kind: "idle" };
}

/**
 * The parts that an agent gave to others in its newest work that still runs: the tasks whose parent
 * is the agent's task. Work that ended shows no plan, so the panel shows only what happens now.
 */
function memberPlan(page: ChannelPage, agentId: string): ShellPlanStep[] {
  const children = new Map<string, ChannelTask[]>();
  for (const task of page.tasks) {
    if (!task.parentTaskId) continue;
    const known = children.get(task.parentTaskId);
    if (known) known.push(task);
    else children.set(task.parentTaskId, [task]);
  }
  const parent = page.tasks.findLast((task) => {
    if (task.ownerAgentId !== agentId) return false;
    const parts = children.get(task.id);
    return (
      parts !== undefined && (ACTIVE_STATES.has(task.state) || parts.some((part) => ACTIVE_STATES.has(part.state)))
    );
  });
  if (!parent) return [];
  // A cancelled part is no longer part of the work.
  const parts = (children.get(parent.id) ?? []).filter((part) => part.state !== "cancelled");
  return parts.slice(0, PLAN_LIMIT).map((part) => ({
    id: part.id,
    label: step(part.instruction, PLAN_STEP_LENGTH) ?? part.expectedResult,
    state: planState(part.state),
  }));
}

function planState(state: ChannelTask["state"]): ShellPlanStep["state"] {
  if (state === "completed") return "done";
  if (state === "running" || state === "waiting") return "running";
  if (state === "failed") return "failed";
  return "todo";
}

/** The first line of an instruction, cut to `length`. */
function step(instruction: string, length = STEP_LENGTH): string | null {
  const line = instruction.trim().split("\n", 1)[0]?.trim() ?? "";
  if (!line) return null;
  return line.length > length ? `${line.slice(0, length - 1)}…` : line;
}
