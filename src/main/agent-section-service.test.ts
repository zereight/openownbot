import type { AgentTemplateSnapshot, SidebarLayoutAction, SidebarLayoutSnapshot } from "@openownbot/contracts/ipc";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { AgentSectionService, type SectionTemplates } from "./agent-section-service";

const snapshotOf = (name: string): Promise<AgentTemplateSnapshot> =>
  Effect.runPromise(
    Effect.succeed({
      name,
      title: "",
      description: `${name} does one job. token=ghp_abcdefghijklmnopqrstuvwxyz0123456789`,
      avatarSeed: "seed-1",
      avatarHue: null,
      skills: [{ kind: "embedded" as const, slug: "s", name: "S", markdown: "# S" }],
      routines: [
        { name: "Daily", instruction: "run", active: true, schedule: { kind: "daily" as const, time: "09:00" } },
      ],
    }),
  );

function setup(existing: Array<{ id: string; name: string }>, layout: SidebarLayoutSnapshot) {
  const actions: SidebarLayoutAction[] = [];
  const installed: AgentTemplateSnapshot[] = [];
  const disabled: string[] = [];
  const calls = { actions, installed, disabled };
  let current = structuredClone(layout);
  const templates: SectionTemplates = {
    snapshot: (agentId) => {
      const agent = existing.find((item) => item.id === agentId);
      return Effect.promise(() => snapshotOf(agent?.name ?? "?"));
    },
    installSnapshot: (snapshot) =>
      Effect.sync(() => {
        calls.installed.push(snapshot);
        existing.push({ id: `new-${calls.installed.length}`, name: snapshot.name });
        return { agentId: `new-${calls.installed.length}`, skillIds: [`skill-${calls.installed.length}`] };
      }),
  };
  const service = new AgentSectionService({
    agents: { list: () => existing },
    sidebar: {
      getSnapshot: () => structuredClone(current),
      mutate: (action) =>
        Effect.sync(() => {
          calls.actions.push(action);
          if (action.type === "create")
            current = {
              ...current,
              sections: [...current.sections, { id: `sec-${current.sections.length + 1}`, name: action.name }],
            };
          if (action.type === "assign")
            current = {
              ...current,
              agentAssignments: action.sectionId
                ? { ...current.agentAssignments, [action.agentId]: action.sectionId }
                : current.agentAssignments,
            };
          return structuredClone(current);
        }),
    },
    templates,
    skills: {
      setEnabled: (input) =>
        Effect.sync(() => {
          calls.disabled.push(`${input.skillId}:${input.enabled}`);
        }),
    },
  });
  return { service, calls };
}

const layout: SidebarLayoutSnapshot = {
  revision: 1,
  sections: [
    { id: "rev", name: "Reviewers" },
    { id: "ops", name: "Ops" },
  ],
  order: ["rev", "ops"],
  agentAssignments: { a: "rev", b: "rev", c: "ops" },
  agentOrder: [],
};
const agents = () => [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
];

describe("AgentSectionService", () => {
  it("exports only the agents of the chosen sections, with secrets hidden", async () => {
    const { service } = setup(agents(), layout);
    const result = await Effect.runPromise(service.exportFile(["rev"], "Work"));
    expect(result.agents).toBe(2);
    expect(result.masked).toBe(2);
    expect(result.text).not.toContain("ghp_");
    expect(JSON.parse(result.text).sections).toHaveLength(1);
  });

  it("previews a file and says what the import would create", async () => {
    const { service } = setup(agents(), layout);
    const text = (await Effect.runPromise(service.exportFile(["rev", "ops"], "Work"))).text;
    const preview = await Effect.runPromise(service.preview(text));
    expect(preview).toMatchObject({ ok: true, agents: 3, renamed: 5 });
  });

  it("refuses a file that is not a section file", async () => {
    const { service } = setup(agents(), layout);
    expect(await Effect.runPromise(service.preview("{"))).toEqual({ ok: false, problem: { kind: "json" } });
  });

  it("creates sections and agents, files each agent in its section and switches its skills off", async () => {
    const { service, calls } = setup(agents(), layout);
    const text = (await Effect.runPromise(service.exportFile(["rev"], "Work"))).text;
    const result = await Effect.runPromise(service.importFile(text, "Asia/Seoul"));
    expect(result).toEqual({ agents: 2 });
    expect(calls.actions.filter((action) => action.type === "create")).toEqual([
      { type: "create", name: "Reviewers 2" },
    ]);
    expect(calls.installed.map((item) => item.name)).toEqual(["A 2", "B 2"]);
    expect(calls.installed.every((item) => item.routines.every((routine) => !routine.active))).toBe(true);
    expect(calls.actions.filter((action) => action.type === "assign")).toEqual([
      { type: "assign", agentId: "new-1", sectionId: "sec-3" },
      { type: "assign", agentId: "new-2", sectionId: "sec-3" },
    ]);
    expect(calls.disabled).toEqual(["skill-1:false", "skill-2:false"]);
  });
});
