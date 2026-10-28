import { INPUT_LIMITS } from "./input-limits";
import { isDynamicRecord, isString } from "./runtime-values";

/**
 * A squad is a group of agents the user names, with one lead. The members are listed, not taken
 * from a sidebar section: an agent can move itself between sections, but only the user can edit a
 * squad. The UI calls it a team; the code says squad because `TeamStore` already means a server.
 */
export interface AgentSquad {
  id: string;
  name: string;
  leadAgentId: string;
  /** The members besides the lead. The lead belongs to the squad without being listed. */
  memberAgentIds: string[];
}

export interface SaveSquadInput {
  /** Absent to create a squad. */
  id?: string;
  name: string;
  leadAgentId: string;
  memberAgentIds: string[];
}

export const SQUAD_LIMITS = { squads: 32, members: 64 } as const;

export function squadHas(squad: AgentSquad, agentId: string): boolean {
  return squad.leadAgentId === agentId || squad.memberAgentIds.includes(agentId);
}

/** The squads an agent leads or belongs to. */
export function squadsOfAgent(squads: readonly AgentSquad[], agentId: string): AgentSquad[] {
  return squads.filter((squad) => squadHas(squad, agentId));
}

export type SquadMessageCheck = { ok: true } | { ok: false; reason: "leavesSquad" | "entersSquad"; squad: string };

/**
 * Whether one agent may start a message to another. Agents of the same squad talk freely. Beyond
 * that, only a squad's lead writes to agents outside it, and an outsider reaches a squad through
 * its lead. Agents that no squad names are not limited, so a computer with no squads behaves as
 * before. Answers, results and what the user starts never come here.
 */
export function squadMayMessage(squads: readonly AgentSquad[], fromId: string, toId: string): SquadMessageCheck {
  const from = squadsOfAgent(squads, fromId);
  const to = squadsOfAgent(squads, toId);
  if (from.length === 0 && to.length === 0) return { ok: true };
  if (from.some((squad) => squadHas(squad, toId))) return { ok: true };
  const leaving = from.find((squad) => squad.leadAgentId !== fromId);
  if (leaving) return { ok: false, reason: "leavesSquad", squad: leaving.name };
  const entering = to.find((squad) => squad.leadAgentId !== toId);
  if (entering) return { ok: false, reason: "entersSquad", squad: entering.name };
  return { ok: true };
}

export function isAgentSquad(value: unknown): value is AgentSquad {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    value.id.length > 0 &&
    value.id.length <= INPUT_LIMITS.identifier &&
    isString(value.name) &&
    value.name.trim().length > 0 &&
    value.name.length <= INPUT_LIMITS.agentName &&
    isString(value.leadAgentId) &&
    value.leadAgentId.length > 0 &&
    Array.isArray(value.memberAgentIds) &&
    value.memberAgentIds.length <= SQUAD_LIMITS.members &&
    value.memberAgentIds.every(isString) &&
    new Set(value.memberAgentIds).size === value.memberAgentIds.length &&
    !value.memberAgentIds.includes(value.leadAgentId)
  );
}
