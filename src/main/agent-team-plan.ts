import {
  AGENT_TEAM_FILE_FORMAT,
  type AgentTeamFile,
  type AgentTeamFileSection,
  buildAgentTeamFile,
} from "@openbot/contracts/agent-team-file";
import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import type { AgentTemplateSnapshot } from "@openbot/contracts/ipc";
import { redactText } from "@openbot/logging";

/**
 * The name, or the name with the first free number after it. Names are compared without case,
 * and the result stays inside `limit` by cutting the name, not the number.
 */
export function uniqueName(name: string, taken: ReadonlySet<string>, limit: number = INPUT_LIMITS.agentName): string {
  const used = new Set([...taken].map((item) => item.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let number = 2; ; number += 1) {
    const suffix = ` ${number}`;
    const candidate = `${name.slice(0, limit - suffix.length)}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

function maskAgent(agent: AgentTemplateSnapshot): AgentTemplateSnapshot {
  return {
    ...agent,
    title: redactText(agent.title),
    description: redactText(agent.description),
    skills: agent.skills.map((skill) =>
      skill.kind === "embedded" ? { ...skill, markdown: redactText(skill.markdown) } : skill,
    ),
    routines: agent.routines.map((routine) => ({ ...routine, instruction: redactText(routine.instruction) })),
  };
}

/** The file with secret-looking values hidden, and the number of agents that had any. */
export function maskTeamSecrets(file: AgentTeamFile): { file: AgentTeamFile; agents: number } {
  let agents = 0;
  const sections: AgentTeamFileSection[] = file.sections.map((section) => ({
    name: section.name,
    agents: section.agents.map((agent) => {
      const masked = maskAgent(agent);
      if (JSON.stringify(masked) !== JSON.stringify(agent)) agents += 1;
      return masked;
    }),
  }));
  return { file: buildAgentTeamFile(file.name, sections), agents };
}

export interface TeamImportPlan {
  format: typeof AGENT_TEAM_FILE_FORMAT;
  sections: AgentTeamFileSection[];
  /** The agents to create. */
  agents: number;
  /** The agents and sections that got a number because the name was taken. */
  renamed: number;
}

/**
 * What an import creates: every section is new, an agent or section name that is taken gets a
 * number, and every routine starts paused so nothing runs before the user has read it.
 */
export function planTeamImport(
  file: AgentTeamFile,
  agentNames: ReadonlySet<string>,
  sectionNames: ReadonlySet<string>,
): TeamImportPlan {
  const takenAgents = new Set(agentNames);
  const takenSections = new Set(sectionNames);
  let renamed = 0;
  let agents = 0;
  const sections = file.sections.map((section) => {
    const name = uniqueName(section.name, takenSections, INPUT_LIMITS.sidebarSectionName);
    if (name !== section.name) renamed += 1;
    takenSections.add(name);
    return {
      name,
      agents: section.agents.map((agent) => {
        const agentName = uniqueName(agent.name, takenAgents);
        if (agentName !== agent.name) renamed += 1;
        takenAgents.add(agentName);
        agents += 1;
        return {
          ...agent,
          name: agentName,
          routines: agent.routines.map((routine) => ({ ...routine, active: false })),
        };
      }),
    };
  });
  return { format: AGENT_TEAM_FILE_FORMAT, sections, agents, renamed };
}
