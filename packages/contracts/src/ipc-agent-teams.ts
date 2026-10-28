import type { AgentTeamFileProblem } from "./agent-team-file";
import { isDynamicRecord, isNumber, isString } from "./runtime-values";
import { type AgentSquad, isAgentSquad } from "./squads";

export interface ExportAgentTeamInput {
  sectionIds: string[];
  teamName: string;
}

/** `null` when the user closed the save dialog. */
export interface ExportAgentTeamResult {
  fileName: string;
  agents: number;
  /** The agents that had a value hidden because it looked like a secret. */
  masked: number;
}

export type AgentTeamPreview =
  | {
      ok: true;
      name: string;
      sections: Array<{ name: string; agents: string[] }>;
      agents: number;
      /** The agents and sections that get a number because their name is taken. */
      renamed: number;
      skills: number;
      routines: number;
    }
  | { ok: false; problem: AgentTeamFileProblem };

/** The file the user chose to import: its text goes back with the confirmation. */
export interface ChosenAgentTeam {
  fileName: string;
  text: string;
  preview: AgentTeamPreview;
}

export interface ImportAgentTeamInput {
  text: string;
  timezone: string;
}

export interface ImportAgentTeamResult {
  agents: number;
}

export function decodeExportAgentTeamResult(value: unknown): ExportAgentTeamResult | null {
  if (value === null) return null;
  if (!isDynamicRecord(value) || !isString(value.fileName) || !isNumber(value.agents) || !isNumber(value.masked))
    throw new Error("IPC returned an invalid team export.");
  return { fileName: value.fileName, agents: value.agents, masked: value.masked };
}

const PROBLEMS_WITHOUT_NAME: ReadonlySet<string> = new Set([
  "json",
  "format",
  "version",
  "tooLarge",
  "name",
  "sections",
  "agents",
]);

function decodeProblem(value: unknown): AgentTeamFileProblem {
  if (!isDynamicRecord(value) || !isString(value.kind)) throw new Error("IPC returned an invalid team problem.");
  if (value.kind === "sectionName" && isString(value.section)) return { kind: "sectionName", section: value.section };
  if (
    (value.kind === "agent" || value.kind === "marketplaceSkill" || value.kind === "duplicate") &&
    isString(value.agent)
  )
    return { kind: value.kind, agent: value.agent };
  if (PROBLEMS_WITHOUT_NAME.has(value.kind)) {
    switch (value.kind) {
      case "json":
      case "format":
      case "version":
      case "tooLarge":
      case "name":
      case "sections":
      case "agents":
        return { kind: value.kind };
    }
  }
  throw new Error("IPC returned an invalid team problem.");
}

export function decodeAgentTeamPreview(value: unknown): AgentTeamPreview {
  if (!isDynamicRecord(value)) throw new Error("IPC returned an invalid team preview.");
  if (value.ok === false) return { ok: false, problem: decodeProblem(value.problem) };
  if (
    value.ok !== true ||
    !isString(value.name) ||
    !Array.isArray(value.sections) ||
    !isNumber(value.agents) ||
    !isNumber(value.renamed) ||
    !isNumber(value.skills) ||
    !isNumber(value.routines)
  )
    throw new Error("IPC returned an invalid team preview.");
  const sections = value.sections.map((section) => {
    if (!isDynamicRecord(section) || !isString(section.name) || !Array.isArray(section.agents))
      throw new Error("IPC returned an invalid team preview.");
    return { name: section.name, agents: section.agents.filter(isString) };
  });
  return {
    ok: true,
    name: value.name,
    sections,
    agents: value.agents,
    renamed: value.renamed,
    skills: value.skills,
    routines: value.routines,
  };
}

export function decodeChosenAgentTeam(value: unknown): ChosenAgentTeam | null {
  if (value === null) return null;
  if (!isDynamicRecord(value) || !isString(value.fileName) || !isString(value.text))
    throw new Error("IPC returned an invalid team file.");
  return { fileName: value.fileName, text: value.text, preview: decodeAgentTeamPreview(value.preview) };
}

export function decodeImportAgentTeamResult(value: unknown): ImportAgentTeamResult {
  if (!isDynamicRecord(value) || !isNumber(value.agents)) throw new Error("IPC returned an invalid team import.");
  return { agents: value.agents };
}

export function decodeAgentSquad(value: unknown): AgentSquad {
  if (!isAgentSquad(value)) throw new Error("IPC returned an invalid team.");
  return { id: value.id, name: value.name, leadAgentId: value.leadAgentId, memberAgentIds: [...value.memberAgentIds] };
}

export function decodeAgentSquads(value: unknown): AgentSquad[] {
  if (!Array.isArray(value)) throw new Error("IPC returned an invalid team list.");
  return value.map(decodeAgentSquad);
}
