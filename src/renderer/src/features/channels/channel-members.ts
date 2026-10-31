import type { AgentApproval, ChannelPage, ChannelThread } from "@robot/contracts/ipc";
import type { AgentProfile } from "@robot/ui/data";
import type { ShellAgentState, ShellMember } from "@robot/ui/features/shell/shell-types";
import { channelApproval, waitingChannelPrompt } from "./channel-conversation-rows";

/** How much of a task's instruction the member panel shows as the agent's step. */
const STEP_LENGTH = 80;

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
    return [{ agent, state: state.kind === "failed" ? { ...state, reason: input.failure(state.reason) } : state }];
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

function step(instruction: string): string | null {
  const line = instruction.trim().split("\n", 1)[0]?.trim() ?? "";
  if (!line) return null;
  return line.length > STEP_LENGTH ? `${line.slice(0, STEP_LENGTH - 1)}…` : line;
}
