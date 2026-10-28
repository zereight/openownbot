import { type AgentTeamFileSection, buildAgentTeamFile, parseAgentTeamFile } from "@openbot/contracts/agent-team-file";
import type {
  AgentTeamPreview,
  AgentTemplateSnapshot,
  AvatarImageInput,
  SetEnabledSkillInput,
  SidebarLayoutAction,
  SidebarLayoutSnapshot,
} from "@openbot/contracts/ipc";
import { Effect, Schema } from "effect";
import { maskTeamSecrets, planTeamImport } from "./agent-team-plan";

export interface TeamAgents {
  list(): ReadonlyArray<{ id: string; name: string }>;
}

export interface TeamSidebar {
  getSnapshot(): SidebarLayoutSnapshot;
  mutate(action: SidebarLayoutAction, agentIds: ReadonlySet<string>): Effect.Effect<SidebarLayoutSnapshot, unknown>;
}

export interface TeamTemplates {
  snapshot(agentId: string): Effect.Effect<AgentTemplateSnapshot, unknown>;
  installSnapshot(
    snapshot: AgentTemplateSnapshot,
    avatar: AvatarImageInput | null,
    timezone: string,
  ): Effect.Effect<{ agentId: string; skillIds: string[] }, unknown>;
}

export interface TeamSkills {
  setEnabled(input: SetEnabledSkillInput): Effect.Effect<unknown, unknown>;
}

export interface AgentTeamOptions {
  agents: TeamAgents;
  sidebar: TeamSidebar;
  templates: TeamTemplates;
  skills: TeamSkills;
}

export class AgentTeamFailure extends Schema.TaggedError<AgentTeamFailure>()("AgentTeamFailure", {
  cause: Schema.Defect(),
}) {}

const toAgentTeamFailure = Effect.mapError((cause: unknown) => new AgentTeamFailure({ cause }));

/**
 * Moves the agents of some sidebar sections to a file and back. An import creates new agents and
 * new sections: it never changes an agent that is already there, it starts every routine paused
 * and switches the skills off, and a name that is taken gets a number.
 */
export class AgentTeamService {
  readonly #options: AgentTeamOptions;

  constructor(options: AgentTeamOptions) {
    this.#options = options;
  }

  /** The text of a file with the agents of `sectionIds`, secrets hidden. */
  exportFile(sectionIds: readonly string[], teamName: string) {
    return Effect.gen({ self: this }, function* () {
      const layout = this.#options.sidebar.getSnapshot();
      const known = new Set(this.#options.agents.list().map((agent) => agent.id));
      const sections: AgentTeamFileSection[] = [];
      for (const section of layout.sections) {
        if (!sectionIds.includes(section.id)) continue;
        const agents: AgentTemplateSnapshot[] = [];
        for (const [agentId, assigned] of Object.entries(layout.agentAssignments))
          if (assigned === section.id && known.has(agentId))
            agents.push(yield* this.#options.templates.snapshot(agentId));
        sections.push({ name: section.name, agents });
      }
      const { file, agents: masked } = maskTeamSecrets(buildAgentTeamFile(teamName, sections));
      return {
        text: `${JSON.stringify(file, null, 2)}\n`,
        agents: file.sections.reduce((sum, section) => sum + section.agents.length, 0),
        masked,
      };
    }).pipe(toAgentTeamFailure);
  }

  /** What importing `text` would create, or why it cannot be imported. */
  preview(text: string): Effect.Effect<AgentTeamPreview> {
    return Effect.sync(() => {
      const parsed = parseAgentTeamFile(text);
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
      const parsed = parseAgentTeamFile(text);
      if (!parsed.ok) return yield* Effect.fail(new Error(`The team file cannot be read: ${parsed.problem.kind}`));
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
    }).pipe(toAgentTeamFailure);
  }

  #plan(file: Parameters<typeof planTeamImport>[0]) {
    const layout = this.#options.sidebar.getSnapshot();
    return planTeamImport(
      file,
      new Set(this.#options.agents.list().map((agent) => agent.name)),
      new Set(layout.sections.map((section) => section.name)),
    );
  }
}
