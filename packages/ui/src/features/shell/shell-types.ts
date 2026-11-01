import type { AgentProfile } from "../../data";

/** The avatar fields of an agent, as `AgentAvatar` reads them. */
export type ShellAgentIdentity = Pick<AgentProfile, "id" | "name" | "avatarSeed" | "avatarHue" | "avatarUrl">;

/** One server in the rail: this computer first, then joined servers. */
export interface ShellServer {
  id: string;
  name: string;
}

/** A channel or an agent's direct chat in the list. */
export type ShellPlace =
  | { kind: "channel"; id: string; name: string; unread: number }
  | { kind: "agent"; id: string; agent: ShellAgentIdentity; state: ShellAgentState; unread: number };

/** Names one place of the list. */
export type ShellPlaceKey = Pick<ShellPlace, "kind" | "id">;

/**
 * What an agent does now. The member panel and the list show the same state, so the dot of a row
 * and its line in the panel never disagree.
 */
export type ShellAgentState =
  | { kind: "idle" }
  | { kind: "working"; step: string | null }
  | { kind: "waiting"; reason: "approval" | "answer"; detail: string | null }
  | { kind: "failed"; reason: string };

/** One part of the work that an agent gave to others, as a line of its checklist. */
export interface ShellPlanStep {
  id: string;
  label: string;
  state: "todo" | "running" | "done" | "failed";
}

/** One agent in the member panel. */
export interface ShellMember {
  agent: ShellAgentIdentity;
  state: ShellAgentState;
  /** The parts of its running work that the agent gave to others. Empty when it split nothing. */
  plan?: readonly ShellPlanStep[];
}
