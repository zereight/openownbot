import {
  AGENT_TEAM_FILE_FORMAT,
  AGENT_TEAM_FILE_LIMITS,
  buildAgentTeamFile,
  parseAgentTeamFile,
} from "@openbot/contracts/agent-team-file";
import type { AgentTemplateSnapshot } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";

const agent = (name: string, extra: Partial<AgentTemplateSnapshot> = {}): AgentTemplateSnapshot => ({
  name,
  title: "",
  description: `${name} does one job.`,
  avatarSeed: "seed-1",
  avatarHue: null,
  skills: [],
  routines: [],
  ...extra,
});

const team = (agents: AgentTemplateSnapshot[]) => buildAgentTeamFile("Work", [{ name: "Reviewers", agents }]);

describe("the agent team file", () => {
  it("reads back what it wrote", () => {
    const file = team([agent("A"), agent("B")]);
    const result = parseAgentTeamFile(JSON.stringify(file));
    expect(result).toEqual({ ok: true, file });
    expect(file.format).toBe(AGENT_TEAM_FILE_FORMAT);
  });

  it("keeps only the known fields of an agent", () => {
    const text = JSON.stringify({
      format: AGENT_TEAM_FILE_FORMAT,
      version: 1,
      name: "Work",
      sections: [
        {
          name: "Reviewers",
          agents: [{ ...agent("A"), model: "x", access: "full", apiKey: "secret", workspacePath: "/tmp" }],
        },
      ],
    });
    const result = parseAgentTeamFile(text);
    if (!result.ok) throw new Error("expected a team");
    expect(result.file.sections[0]?.agents[0]).toEqual(agent("A"));
  });

  it("refuses text that is not JSON, another format, or a newer version", () => {
    expect(parseAgentTeamFile("{")).toEqual({ ok: false, problem: { kind: "json" } });
    expect(parseAgentTeamFile(JSON.stringify({ ...team([agent("A")]), format: "other" }))).toEqual({
      ok: false,
      problem: { kind: "format" },
    });
    expect(parseAgentTeamFile(JSON.stringify({ ...team([agent("A")]), version: 2 }))).toEqual({
      ok: false,
      problem: { kind: "version" },
    });
  });

  it("refuses a marketplace skill, which needs the account service to install", () => {
    const skill = { kind: "marketplace", skillId: "s", versionId: "v", slug: "s", name: "S", version: 1 } as const;
    const result = parseAgentTeamFile(JSON.stringify(team([agent("A", { skills: [skill] })])));
    expect(result).toEqual({ ok: false, problem: { kind: "marketplaceSkill", agent: "A" } });
  });

  it("names the agent that does not fit the limits", () => {
    const result = parseAgentTeamFile(JSON.stringify(team([agent("A"), agent("B", { description: " " })])));
    expect(result).toEqual({ ok: false, problem: { kind: "agent", agent: "B" } });
  });

  it("limits the sections, the agents and the size", () => {
    const many = Array.from({ length: AGENT_TEAM_FILE_LIMITS.agents + 1 }, (_, i) => agent(`A${i}`));
    expect(parseAgentTeamFile(JSON.stringify(team(many)))).toEqual({ ok: false, problem: { kind: "agents" } });
    const sections = Array.from({ length: AGENT_TEAM_FILE_LIMITS.sections + 1 }, (_, i) => ({
      name: `S${i}`,
      agents: [agent(`B${i}`)],
    }));
    expect(parseAgentTeamFile(JSON.stringify(buildAgentTeamFile("Work", sections)))).toEqual({
      ok: false,
      problem: { kind: "sections" },
    });
    expect(parseAgentTeamFile("x".repeat(AGENT_TEAM_FILE_LIMITS.bytes + 1))).toEqual({
      ok: false,
      problem: { kind: "tooLarge" },
    });
  });

  it("refuses two agents with the same name in one file", () => {
    expect(parseAgentTeamFile(JSON.stringify(team([agent("A"), agent("A")])))).toEqual({
      ok: false,
      problem: { kind: "duplicate", agent: "A" },
    });
  });
});
