import type { AgentSquad } from "@openbot/contracts/squads";

/** The small heading over a run of agents in a team. `none` is a run with no heading. */
export type SidebarTeamHeading =
  | { kind: "none" }
  | { kind: "lead" }
  | { kind: "rank"; name: string }
  | { kind: "unranked" };

export interface SidebarTeamGroup<Agent extends { id: string }> {
  id: string;
  name: string;
  /** Every agent of the group, in the order that the sections give. */
  agents: Agent[];
  sections: { heading: SidebarTeamHeading; agents: Agent[] }[];
}

/**
 * The agents under each team. A team with no ranks is one run, the lead first and then the members
 * in the order that the user picked them. A team with ranks is a run per rank under a heading: the
 * lead, the ranks from the highest, and the members with no rank. An agent that the sidebar does not
 * show, such as a hidden one, is left out, and so is a run or a team with nothing to show. An agent in
 * two teams shows under both. `loose` holds the agents in no team, in the order that the sidebar gives.
 */
export function groupAgentsByTeam<Agent extends { id: string }>(
  squads: readonly AgentSquad[],
  agents: readonly Agent[],
): { groups: SidebarTeamGroup<Agent>[]; loose: Agent[] } {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const shown = (ids: readonly string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  const groups = squads.flatMap((squad) => {
    const members = (rank: string | undefined) =>
      squad.memberAgentIds.filter((id) => (squad.memberRanks[id] ?? undefined) === rank);
    const runs: { heading: SidebarTeamHeading; ids: string[] }[] =
      squad.ranks.length === 0
        ? [{ heading: { kind: "none" }, ids: [squad.leadAgentId, ...squad.memberAgentIds] }]
        : [
            { heading: { kind: "lead" }, ids: [squad.leadAgentId] },
            ...squad.ranks.map((name) => ({ heading: { kind: "rank", name } as const, ids: members(name) })),
            { heading: { kind: "unranked" }, ids: members(undefined) },
          ];
    const sections = runs.flatMap((run) => {
      const inRun = shown(run.ids);
      return inRun.length > 0 ? [{ heading: run.heading, agents: inRun }] : [];
    });
    return sections.length > 0
      ? [{ id: squad.id, name: squad.name, agents: sections.flatMap((section) => section.agents), sections }]
      : [];
  });
  const inTeam = new Set(squads.flatMap((squad) => [squad.leadAgentId, ...squad.memberAgentIds]));
  return { groups, loose: agents.filter((agent) => !inTeam.has(agent.id)) };
}
