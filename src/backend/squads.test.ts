import { type AgentSquad, squadMayMessage, squadsOfAgent } from "@openbot/contracts/squads";
import { describe, expect, it } from "vitest";

const review: AgentSquad = { id: "s1", name: "Review", leadAgentId: "lead", memberAgentIds: ["a", "b"] };
const ops: AgentSquad = { id: "s2", name: "Ops", leadAgentId: "ops-lead", memberAgentIds: ["c"] };

describe("squadMayMessage", () => {
  it("changes nothing while no squad names either agent", () => {
    expect(squadMayMessage([review], "x", "y")).toEqual({ ok: true });
    expect(squadMayMessage([], "a", "b")).toEqual({ ok: true });
  });

  it("lets squad members, and their lead, talk to each other", () => {
    expect(squadMayMessage([review], "a", "b")).toEqual({ ok: true });
    expect(squadMayMessage([review], "a", "lead")).toEqual({ ok: true });
    expect(squadMayMessage([review], "lead", "b")).toEqual({ ok: true });
  });

  it("lets an outsider reach a squad only through its lead", () => {
    expect(squadMayMessage([review], "x", "lead")).toEqual({ ok: true });
    expect(squadMayMessage([review], "x", "a")).toEqual({ ok: false, reason: "entersSquad", squad: "Review" });
  });

  it("lets only the lead of a squad write to agents outside it", () => {
    expect(squadMayMessage([review], "a", "x")).toEqual({ ok: false, reason: "leavesSquad", squad: "Review" });
    expect(squadMayMessage([review], "lead", "x")).toEqual({ ok: true });
  });

  it("sends the work of one squad to another through the lead of the other", () => {
    const squads = [review, ops];
    expect(squadMayMessage(squads, "lead", "ops-lead")).toEqual({ ok: true });
    expect(squadMayMessage(squads, "lead", "c")).toEqual({ ok: false, reason: "entersSquad", squad: "Ops" });
    expect(squadMayMessage(squads, "a", "ops-lead")).toEqual({ ok: false, reason: "leavesSquad", squad: "Review" });
  });

  it("allows an agent in two squads to talk to the members of either", () => {
    const shared: AgentSquad = { id: "s3", name: "Shared", leadAgentId: "z", memberAgentIds: ["a", "c"] };
    expect(squadMayMessage([review, shared], "a", "c")).toEqual({ ok: true });
    expect(squadMayMessage([review, shared], "a", "b")).toEqual({ ok: true });
  });
});

describe("squadsOfAgent", () => {
  it("lists the squads an agent leads or belongs to", () => {
    expect(squadsOfAgent([review, ops], "lead").map((squad) => squad.id)).toEqual(["s1"]);
    expect(squadsOfAgent([review, ops], "a").map((squad) => squad.id)).toEqual(["s1"]);
    expect(squadsOfAgent([review, ops], "x")).toEqual([]);
  });
});
