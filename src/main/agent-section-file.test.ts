import {
  AGENT_SECTION_FILE_FORMAT,
  AGENT_SECTION_FILE_LIMITS,
  buildAgentSectionFile,
  parseAgentSectionFile,
} from "@robot/contracts/agent-section-file";
import type { AgentTemplateSnapshot } from "@robot/contracts/ipc";
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

const sectionFile = (agents: AgentTemplateSnapshot[]) => buildAgentSectionFile("Work", [{ name: "Reviewers", agents }]);

describe("the agent section file", () => {
  it("reads back what it wrote", () => {
    const file = sectionFile([agent("A"), agent("B")]);
    const result = parseAgentSectionFile(JSON.stringify(file));
    expect(result).toEqual({ ok: true, file });
    expect(file.format).toBe(AGENT_SECTION_FILE_FORMAT);
  });

  it("keeps only the known fields of an agent", () => {
    const text = JSON.stringify({
      format: AGENT_SECTION_FILE_FORMAT,
      version: 1,
      name: "Work",
      sections: [
        {
          name: "Reviewers",
          agents: [{ ...agent("A"), model: "x", access: "full", apiKey: "secret", workspacePath: "/tmp" }],
        },
      ],
    });
    const result = parseAgentSectionFile(text);
    if (!result.ok) throw new Error("expected a section file");
    expect(result.file.sections[0]?.agents[0]).toEqual(agent("A"));
  });

  it("refuses text that is not JSON, another format, or a newer version", () => {
    expect(parseAgentSectionFile("{")).toEqual({ ok: false, problem: { kind: "json" } });
    expect(parseAgentSectionFile(JSON.stringify({ ...sectionFile([agent("A")]), format: "other" }))).toEqual({
      ok: false,
      problem: { kind: "format" },
    });
    expect(parseAgentSectionFile(JSON.stringify({ ...sectionFile([agent("A")]), version: 2 }))).toEqual({
      ok: false,
      problem: { kind: "version" },
    });
  });

  it("refuses a marketplace skill, which needs the account service to install", () => {
    const skill = { kind: "marketplace", skillId: "s", versionId: "v", slug: "s", name: "S", version: 1 } as const;
    const result = parseAgentSectionFile(JSON.stringify(sectionFile([agent("A", { skills: [skill] })])));
    expect(result).toEqual({ ok: false, problem: { kind: "marketplaceSkill", agent: "A" } });
  });

  it("names the agent that does not fit the limits", () => {
    const result = parseAgentSectionFile(JSON.stringify(sectionFile([agent("A"), agent("B", { description: " " })])));
    expect(result).toEqual({ ok: false, problem: { kind: "agent", agent: "B" } });
  });

  it("limits the sections, the agents and the size", () => {
    const many = Array.from({ length: AGENT_SECTION_FILE_LIMITS.agents + 1 }, (_, i) => agent(`A${i}`));
    expect(parseAgentSectionFile(JSON.stringify(sectionFile(many)))).toEqual({
      ok: false,
      problem: { kind: "agents" },
    });
    const sections = Array.from({ length: AGENT_SECTION_FILE_LIMITS.sections + 1 }, (_, i) => ({
      name: `S${i}`,
      agents: [agent(`B${i}`)],
    }));
    expect(parseAgentSectionFile(JSON.stringify(buildAgentSectionFile("Work", sections)))).toEqual({
      ok: false,
      problem: { kind: "sections" },
    });
    expect(parseAgentSectionFile("x".repeat(AGENT_SECTION_FILE_LIMITS.bytes + 1))).toEqual({
      ok: false,
      problem: { kind: "tooLarge" },
    });
  });

  it("refuses two agents with the same name in one file", () => {
    expect(parseAgentSectionFile(JSON.stringify(sectionFile([agent("A"), agent("A")])))).toEqual({
      ok: false,
      problem: { kind: "duplicate", agent: "A" },
    });
  });
});
