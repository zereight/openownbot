// The teams the user makes: who leads, who belongs. Only these handlers write the store, and no agent tool
// reaches it, so an agent cannot change its own team.

import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import { type SaveSquadInput, SQUAD_LIMITS } from "@openbot/contracts/ipc";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { SquadStore } from "../../backend/squad-store";
import { handler, type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";
import { isObject, requireString, stringPayload } from "./validation";

export interface SquadIpcDependencies {
  squads: SquadStore;
  agentIds: () => ReadonlySet<string>;
}

export function squadIpcHandlers({ squads, agentIds }: SquadIpcDependencies): Pick<IpcGroupHandlers, "squads"> {
  return {
    squads: {
      list: handler(async () => {
        await runCauseEffect(squads.reconcile(agentIds()));
        return squads.list();
      }),
      save: payloadHandler(parseSaveSquad, (input) => runCauseEffect(squads.save(input, agentIds()))),
      remove: payloadHandler(stringPayload("squadId"), (squadId) => runCauseEffect(squads.remove(squadId))),
    },
  };
}

export function parseSaveSquad(input: unknown): SaveSquadInput {
  if (
    !isObject(input) ||
    !Array.isArray(input.memberAgentIds) ||
    input.memberAgentIds.length > SQUAD_LIMITS.members ||
    !Array.isArray(input.ranks) ||
    input.ranks.length > SQUAD_LIMITS.ranks ||
    !isObject(input.memberRanks)
  )
    throw new Error("Invalid team.");
  return {
    ...(input.id === undefined ? {} : { id: requireString(input.id, "id") }),
    name: requireString(input.name, "name", INPUT_LIMITS.agentName),
    leadAgentId: requireString(input.leadAgentId, "leadAgentId"),
    memberAgentIds: input.memberAgentIds.map((id) => requireString(id, "memberAgentId")),
    ranks: input.ranks.map((rank) => requireString(rank, "rank", SQUAD_LIMITS.rankName)),
    memberRanks: Object.fromEntries(
      Object.entries(input.memberRanks).map(([id, rank]) => [
        id,
        requireString(rank, "memberRank", SQUAD_LIMITS.rankName),
      ]),
    ),
  };
}
