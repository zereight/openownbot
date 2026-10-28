import { type AgentSquad, squadLevels, squadMayMessage, squadsOfAgent } from "@openbot/contracts/squads";
import { describe, expect, it } from "vitest";

const review: AgentSquad = {
  id: "s1",
  name: "Review",
  leadAgentId: "lead",
  memberAgentIds: ["a", "b"],
  ranks: [],
  memberRanks: {},
};
const ops: AgentSquad = {
  id: "s2",
  name: "Ops",
  leadAgentId: "ops-lead",
  memberAgentIds: ["c"],
  ranks: [],
  memberRanks: {},
};

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
    const shared: AgentSquad = {
      id: "s3",
      name: "Shared",
      leadAgentId: "z",
      memberAgentIds: ["a", "c"],
      ranks: [],
      memberRanks: {},
    };
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

describe("ranks inside a squad", () => {
  const ranked: AgentSquad = {
    id: "s4",
    name: "Studio",
    leadAgentId: "boss",
    memberAgentIds: ["senior", "peer", "junior", "intern", "plain"],
    ranks: ["senior", "junior", "intern"],
    memberRanks: { senior: "senior", peer: "senior", junior: "junior", intern: "intern" },
  };
  const may = (from: string, to: string) => squadMayMessage([ranked], from, to);

  it("puts the lead above every rank and an agent with no rank below them", () => {
    expect(squadLevels(ranked)).toEqual({ boss: -1, senior: 0, peer: 0, junior: 1, intern: 2, plain: 3 });
  });

  it("lets an agent write to its own rank and to every rank below it", () => {
    expect(may("senior", "peer")).toEqual({ ok: true });
    expect(may("senior", "intern")).toEqual({ ok: true });
    expect(may("boss", "plain")).toEqual({ ok: true });
  });

  it("lets an agent write up only to the rank directly above it", () => {
    expect(may("junior", "senior")).toEqual({ ok: true });
    expect(may("intern", "junior")).toEqual({ ok: true });
    expect(may("senior", "boss")).toEqual({ ok: true });
  });

  it("refuses a message that skips a rank above", () => {
    expect(may("intern", "senior")).toEqual({ ok: false, reason: "skipsRank", squad: "Studio" });
    expect(may("junior", "boss")).toEqual({ ok: false, reason: "skipsRank", squad: "Studio" });
  });

  it("skips a rank that nobody holds when it counts what is directly above", () => {
    const gap: AgentSquad = {
      ...ranked,
      memberRanks: { senior: "senior", intern: "intern" },
      memberAgentIds: ["senior", "intern"],
    };
    expect(squadMayMessage([gap], "intern", "senior")).toEqual({ ok: true });
  });

  it("allows the message when another squad that both are in allows it", () => {
    const flat: AgentSquad = {
      id: "s5",
      name: "Flat",
      leadAgentId: "z",
      memberAgentIds: ["intern", "senior"],
      ranks: [],
      memberRanks: {},
    };
    expect(squadMayMessage([ranked, flat], "intern", "senior")).toEqual({ ok: true });
  });

  it("keeps the rule for a squad with no ranks as before", () => {
    expect(squadMayMessage([review], "a", "lead")).toEqual({ ok: true });
  });
});
