import { buildAgentSectionFile } from "@robot/contracts/agent-section-file";
import type { AgentTemplateSnapshot, MarketplaceAgentRoutine } from "@robot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { maskSectionSecrets, planSectionImport, uniqueName } from "./agent-section-plan";

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

const routine = (instruction: string): MarketplaceAgentRoutine => ({
  name: "Daily",
  instruction,
  active: true,
  schedule: { kind: "daily", time: "09:00" },
});

describe("uniqueName", () => {
  it("keeps a free name and numbers a taken one", () => {
    expect(uniqueName("Bianca", new Set())).toBe("Bianca");
    expect(uniqueName("Bianca", new Set(["Bianca"]))).toBe("Bianca 2");
    expect(uniqueName("Bianca", new Set(["Bianca", "Bianca 2"]))).toBe("Bianca 3");
  });

  it("compares without case and stays inside the length limit", () => {
    expect(uniqueName("bianca", new Set(["Bianca"]))).toBe("bianca 2");
    const long = "x".repeat(80);
    const result = uniqueName(long, new Set([long]));
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith(" 2")).toBe(true);
  });
});

describe("maskSectionSecrets", () => {
  it("hides secrets in instructions, routines and skills, and counts the agents it changed", () => {
    const file = buildAgentSectionFile("Work", [
      {
        name: "Reviewers",
        agents: [
          agent("A", { description: "Use token=ghp_abcdefghijklmnopqrstuvwxyz0123456789 to push." }),
          agent("B", { routines: [routine("password: hunter2hunter2")] }),
          agent("C", {
            skills: [
              {
                kind: "embedded",
                slug: "s",
                name: "S",
                markdown: "# S\nAuthorization: Bearer abc.def.ghijklmnop12345",
              },
            ],
          }),
          agent("D"),
        ],
      },
    ]);
    const { file: masked, agents } = maskSectionSecrets(file);
    expect(agents).toBe(3);
    const all = JSON.stringify(masked);
    expect(all).not.toContain("ghp_");
    expect(all).not.toContain("hunter2");
    expect(all).not.toContain("Bearer abc");
    expect(masked.sections[0]?.agents[3]).toEqual(agent("D"));
  });
});

describe("planSectionImport", () => {
  const file = buildAgentSectionFile("Work", [
    { name: "Reviewers", agents: [agent("A", { routines: [routine("run")] }), agent("B")] },
    { name: "Ops", agents: [agent("C")] },
  ]);

  it("renames what collides with the agents and sections already there", () => {
    const plan = planSectionImport(file, new Set(["A"]), new Set(["Reviewers"]));
    expect(plan.sections.map((section) => section.name)).toEqual(["Reviewers 2", "Ops"]);
    expect(plan.sections[0]?.agents.map((item) => item.name)).toEqual(["A 2", "B"]);
    expect(plan.renamed).toBe(2);
  });

  it("starts every routine paused", () => {
    const plan = planSectionImport(file, new Set(), new Set());
    expect(plan.sections[0]?.agents[0]?.routines.map((item) => item.active)).toEqual([false]);
  });

  it("counts the agents to create", () => {
    expect(planSectionImport(file, new Set(), new Set()).agents).toBe(3);
  });
});
