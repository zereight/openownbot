import {
  buildAgentSectionFile,
  parseAgentSectionFile,
  type SectionFileEntry,
} from "@robot/contracts/agent-section-file";
import type {
  AgentSectionPreview,
  AgentTemplateSnapshot,
  AvatarImageInput,
  SetEnabledSkillInput,
  SidebarLayoutAction,
  SidebarLayoutSnapshot,
} from "@robot/contracts/ipc";
import { Effect, Schema } from "effect";
import { maskSectionSecrets, planSectionImport } from "./agent-section-plan";

export interface SectionAgents {
  list(): ReadonlyArray<{ id: string; name: string }>;
}

export interface SectionSidebar {
  getSnapshot(): SidebarLayoutSnapshot;
  mutate(action: SidebarLayoutAction, agentIds: ReadonlySet<string>): Effect.Effect<SidebarLayoutSnapshot, unknown>;
}

export interface SectionTemplates {
  snapshot(agentId: string): Effect.Effect<AgentTemplateSnapshot, unknown>;
  installSnapshot(
    snapshot: AgentTemplateSnapshot,
    avatar: AvatarImageInput | null,
    timezone: string,
  ): Effect.Effect<{ agentId: string; skillIds: string[] }, unknown>;
}

export interface SectionSkills {
  setEnabled(input: SetEnabledSkillInput): Effect.Effect<unknown, unknown>;
}

export interface AgentSectionOptions {
  agents: SectionAgents;
  sidebar: SectionSidebar;
  templates: SectionTemplates;
  skills: SectionSkills;
}

export class AgentSectionFailure extends Schema.TaggedError<AgentSectionFailure>()("AgentSectionFailure", {
  cause: Schema.Defect(),
}) {}

const toAgentSectionFailure = Effect.mapError((cause: unknown) => new AgentSectionFailure({ cause }));

/**
 * Moves the agents of some sidebar sections to a file and back. An import creates new agents and
 * new sections: it never changes an agent that is already there, it starts every routine paused
 * and switches the skills off, and a name that is taken gets a number.
 */
export class AgentSectionService {
  readonly #options: AgentSectionOptions;

  constructor(options: AgentSectionOptions) {
    this.#options = options;
  }

  /** The text of a file with the agents of `sectionIds`, secrets hidden. */
  exportFile(sectionIds: readonly string[], exportName: string) {
    return Effect.gen({ self: this }, function* () {
      const layout = this.#options.sidebar.getSnapshot();
      const known = new Set(this.#options.agents.list().map((agent) => agent.id));
      const sections: SectionFileEntry[] = [];
      for (const section of layout.sections) {
        if (!sectionIds.includes(section.id)) continue;
        const agents: AgentTemplateSnapshot[] = [];
        for (const [agentId, assigned] of Object.entries(layout.agentAssignments))
          if (assigned === section.id && known.has(agentId))
            agents.push(yield* this.#options.templates.snapshot(agentId));
        sections.push({ name: section.name, agents });
      }
      const { file, agents: masked } = maskSectionSecrets(buildAgentSectionFile(exportName, sections));
      return {
        text: `${JSON.stringify(file, null, 2)}\n`,
        agents: file.sections.reduce((sum, section) => sum + section.agents.length, 0),
        masked,
      };
    }).pipe(toAgentSectionFailure);
  }

  /** What importing `text` would create, or why it cannot be imported. */
  preview(text: string): Effect.Effect<AgentSectionPreview> {
    return Effect.sync(() => {
      const parsed = parseAgentSectionFile(text);
      if (!parsed.ok) return parsed;
      const plan = this.#plan(parsed.file);
      const all = plan.sections.flatMap((section) => section.agents);
      return {
        ok: true,
        name: parsed.file.name,
        sections: plan.sections.map((section) => ({
          name: section.name,
          agents: section.agents.map((agent) => agent.name),
        })),
        agents: plan.agents,
        renamed: plan.renamed,
        skills: all.reduce((sum, agent) => sum + agent.skills.length, 0),
        routines: all.reduce((sum, agent) => sum + agent.routines.length, 0),
      };
    });
  }

  /** Creates the sections and agents of `text`. A failure stops there; what was made stays. */
  importFile(text: string, timezone: string) {
    return Effect.gen({ self: this }, function* () {
      const parsed = parseAgentSectionFile(text);
      if (!parsed.ok) return yield* Effect.fail(new Error(`The section file cannot be read: ${parsed.problem.kind}`));
      const plan = this.#plan(parsed.file);
      let created = 0;
      for (const section of plan.sections) {
        const before = new Set(this.#options.sidebar.getSnapshot().sections.map((item) => item.id));
        const layout = yield* this.#options.sidebar.mutate({ type: "create", name: section.name }, new Set());
        const sectionId = layout.sections.find((item) => !before.has(item.id))?.id;
        if (!sectionId) return yield* Effect.fail(new Error("The new section was not found."));
        for (const agent of section.agents) {
          const installed = yield* this.#options.templates.installSnapshot(agent, null, timezone);
          yield* this.#options.sidebar.mutate(
            { type: "assign", agentId: installed.agentId, sectionId },
            new Set([installed.agentId]),
          );
          for (const skillId of installed.skillIds)
            yield* this.#options.skills.setEnabled({ agentId: installed.agentId, skillId, enabled: false });
          created += 1;
        }
      }
      return { agents: created };
    }).pipe(toAgentSectionFailure);
  }

  #plan(file: Parameters<typeof planSectionImport>[0]) {
    const layout = this.#options.sidebar.getSnapshot();
    return planSectionImport(
      file,
      new Set(this.#options.agents.list().map((agent) => agent.name)),
      new Set(layout.sections.map((section) => section.name)),
    );
  }
}
