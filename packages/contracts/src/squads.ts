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
  /** The ranks of the squad, the highest first. The lead is above all of them and is not listed. */
  ranks: string[];
  /** The rank of a member, by agent id. A member missing here has no rank and sits below every rank. */
  memberRanks: Record<string, string>;
}

export interface SaveSquadInput {
  /** Absent to create a squad. */
  id?: string;
  name: string;
  leadAgentId: string;
  memberAgentIds: string[];
  ranks: string[];
  memberRanks: Record<string, string>;
}

export const SQUAD_LIMITS = { squads: 32, members: 64, ranks: 8, rankName: 40 } as const;

export function squadHas(squad: AgentSquad, agentId: string): boolean {
  return squad.leadAgentId === agentId || squad.memberAgentIds.includes(agentId);
}

/** The squads an agent leads or belongs to. */
export function squadsOfAgent(squads: readonly AgentSquad[], agentId: string): AgentSquad[] {
  return squads.filter((squad) => squadHas(squad, agentId));
}

export type SquadMessageCheck =
  | { ok: true }
  | { ok: false; reason: "leavesSquad" | "entersSquad" | "skipsRank"; squad: string };

/**
 * How high each agent of a squad stands, the highest as the smallest number. The lead is -1, the
 * ranks follow from 0, and a member with no rank sits below the last of them.
 */
export function squadLevels(squad: AgentSquad): Record<string, number> {
  const levels: Record<string, number> = { [squad.leadAgentId]: -1 };
  for (const id of squad.memberAgentIds) {
    const index = squad.ranks.indexOf(squad.memberRanks[id] ?? "");
    levels[id] = index === -1 ? squad.ranks.length : index;
  }
  return levels;
}

/**
 * Whether `fromId` may start a message to `toId` inside one squad. Its own rank and every rank
 * below are free. Upward it reaches only the rank directly above its own that someone holds, so the
 * work of a junior goes to a senior and not past one to the lead.
 */
function rankAllows(squad: AgentSquad, fromId: string, toId: string): boolean {
  const levels = squadLevels(squad);
  const from = levels[fromId];
  const to = levels[toId];
  if (from === undefined || to === undefined || to >= from) return true;
  const above = Object.values(levels).filter((level) => level < from);
  return to === Math.max(...above);
}

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
  const shared = from.filter((squad) => squadHas(squad, toId));
  if (shared.length > 0) {
    if (shared.some((squad) => rankAllows(squad, fromId, toId))) return { ok: true };
    return { ok: false, reason: "skipsRank", squad: shared[0]?.name ?? "" };
  }
  const leaving = from.find((squad) => squad.leadAgentId !== fromId);
  if (leaving) return { ok: false, reason: "leavesSquad", squad: leaving.name };
  const entering = to.find((squad) => squad.leadAgentId !== toId);
  if (entering) return { ok: false, reason: "entersSquad", squad: entering.name };
  return { ok: true };
}

function isRankList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= SQUAD_LIMITS.ranks &&
    value.every(
      (rank) => isString(rank) && rank === rank.trim() && rank.length > 0 && rank.length <= SQUAD_LIMITS.rankName,
    ) &&
    new Set(value).size === value.length
  );
}

function memberRanksAreValid(memberIds: readonly string[], ranks: readonly string[], value: unknown): boolean {
  return (
    isDynamicRecord(value) &&
    Object.entries(value).every(([id, rank]) => memberIds.includes(id) && isString(rank) && ranks.includes(rank))
  );
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
    !value.memberAgentIds.includes(value.leadAgentId) &&
    isRankList(value.ranks) &&
    memberRanksAreValid(value.memberAgentIds, value.ranks, value.memberRanks)
  );
}
