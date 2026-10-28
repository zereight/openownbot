import { groupAgentsByTeam } from "@openbot/ui/features/sidebar/sidebar-teams";
import { describe, expect, it } from "vitest";

const agents = ["lead", "a", "b", "c", "solo"].map((id) => ({ id }));
const squad = (id: string, leadAgentId: string, memberAgentIds: string[]) => ({
  id,
  name: `Team ${id}`,
  leadAgentId,
  memberAgentIds,
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
});
