import type { AgentSquad } from "@openbot/contracts/squads";

export interface SidebarTeamGroup<Agent extends { id: string }> {
  id: string;
  name: string;
  agents: Agent[];
}

/**
 * The agents under each team, the lead first and then the members in the order that the user picked
 * them. An agent that the sidebar does not show, such as a hidden one, is left out, and a team with
 * nothing to show is left out too. An agent in two teams shows under both. `loose` holds the agents
 * in no team, in the order that the sidebar gives.
 */
export function groupAgentsByTeam<Agent extends { id: string }>(
  squads: readonly AgentSquad[],
  agents: readonly Agent[],
): { groups: SidebarTeamGroup<Agent>[]; loose: Agent[] } {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const groups = squads.flatMap((squad) => {
    const shown = [squad.leadAgentId, ...squad.memberAgentIds].flatMap((id) => byId.get(id) ?? []);
    return shown.length > 0 ? [{ id: squad.id, name: squad.name, agents: shown }] : [];
  });
  const inTeam = new Set(squads.flatMap((squad) => [squad.leadAgentId, ...squad.memberAgentIds]));
  return { groups, loose: agents.filter((agent) => !inTeam.has(agent.id)) };
}
