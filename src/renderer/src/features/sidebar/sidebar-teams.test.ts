import { groupAgentsByTeam } from "@openbot/ui/features/sidebar/sidebar-teams";
import { describe, expect, it } from "vitest";

const agents = ["lead", "a", "b", "c", "solo"].map((id) => ({ id }));
const squad = (id: string, leadAgentId: string, memberAgentIds: string[]) => ({
  id,
  name: `Team ${id}`,
  leadAgentId,
  memberAgentIds,
  ranks: [],
  memberRanks: {},
});

describe("groupAgentsByTeam", () => {
  it("puts the lead first and keeps the members in the picked order", () => {
    const { groups } = groupAgentsByTeam([squad("s1", "lead", ["c", "a"])], agents);
    expect(groups[0]?.agents.map((agent) => agent.id)).toEqual(["lead", "c", "a"]);
  });

  it("leaves the agents in no team to the end, in the sidebar's order", () => {
    const { loose } = groupAgentsByTeam([squad("s1", "lead", ["c"])], agents);
    expect(loose.map((agent) => agent.id)).toEqual(["a", "b", "solo"]);
  });

  it("shows an agent under every team it is in", () => {
    const { groups } = groupAgentsByTeam([squad("s1", "lead", ["a"]), squad("s2", "b", ["a"])], agents);
    expect(groups.map((group) => group.agents.map((agent) => agent.id))).toEqual([
      ["lead", "a"],
      ["b", "a"],
    ]);
  });

  it("skips agents that the sidebar does not show, and a team with none left", () => {
    const shown = agents.filter((agent) => agent.id !== "lead" && agent.id !== "c");
    const { groups } = groupAgentsByTeam([squad("s1", "lead", ["c"]), squad("s2", "b", ["lead"])], shown);
    expect(groups.map((group) => group.id)).toEqual(["s2"]);
    expect(groups[0]?.agents.map((agent) => agent.id)).toEqual(["b"]);
  });

  it("lists everyone as loose when there is no team", () => {
    expect(groupAgentsByTeam([], agents).loose).toHaveLength(5);
  });

  it("gives a team with ranks a run per rank, from the lead down to the agents with no rank", () => {
    const studio = {
      ...squad("s1", "lead", ["a", "b", "c"]),
      ranks: ["senior", "junior"],
      memberRanks: { c: "senior", a: "junior" },
    };
    const { groups } = groupAgentsByTeam([studio], agents);
    expect(groups[0]?.sections.map((section) => [section.heading, section.agents.map((agent) => agent.id)])).toEqual([
      [{ kind: "lead" }, ["lead"]],
      [{ kind: "rank", name: "senior" }, ["c"]],
      [{ kind: "rank", name: "junior" }, ["a"]],
      [{ kind: "unranked" }, ["b"]],
    ]);
    expect(groups[0]?.agents.map((agent) => agent.id)).toEqual(["lead", "c", "a", "b"]);
  });

  it("leaves out a run that nobody in it is shown", () => {
    const studio = { ...squad("s1", "lead", ["a"]), ranks: ["senior", "junior"], memberRanks: { a: "junior" } };
    const { groups } = groupAgentsByTeam([studio], agents);
    expect(groups[0]?.sections.map((section) => section.heading.kind)).toEqual(["lead", "rank"]);
  });
});
