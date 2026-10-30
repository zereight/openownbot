import type { AgentSectionFileProblem } from "./agent-section-file";
import { isDynamicRecord, isNumber, isString } from "./runtime-values";

export interface ExportAgentSectionInput {
  sectionIds: string[];
  exportName: string;
}

/** `null` when the user closed the save dialog. */
export interface ExportAgentSectionResult {
  fileName: string;
  agents: number;
  /** The agents that had a value hidden because it looked like a secret. */
  masked: number;
}

export type AgentSectionPreview =
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
  | { ok: false; problem: AgentSectionFileProblem };

/** The file the user chose to import: its text goes back with the confirmation. */
export interface ChosenAgentSection {
  fileName: string;
  text: string;
  preview: AgentSectionPreview;
}

export interface ImportAgentSectionInput {
  text: string;
  timezone: string;
}

export interface ImportAgentSectionResult {
  agents: number;
}

export function decodeExportAgentSectionResult(value: unknown): ExportAgentSectionResult | null {
  if (value === null) return null;
  if (!isDynamicRecord(value) || !isString(value.fileName) || !isNumber(value.agents) || !isNumber(value.masked))
    throw new Error("IPC returned an invalid section export.");
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

function decodeProblem(value: unknown): AgentSectionFileProblem {
  if (!isDynamicRecord(value) || !isString(value.kind)) throw new Error("IPC returned an invalid section problem.");
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
  throw new Error("IPC returned an invalid section problem.");
}

export function decodeAgentSectionPreview(value: unknown): AgentSectionPreview {
  if (!isDynamicRecord(value)) throw new Error("IPC returned an invalid section preview.");
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
    throw new Error("IPC returned an invalid section preview.");
  const sections = value.sections.map((section) => {
    if (!isDynamicRecord(section) || !isString(section.name) || !Array.isArray(section.agents))
      throw new Error("IPC returned an invalid section preview.");
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

export function decodeChosenAgentSection(value: unknown): ChosenAgentSection | null {
  if (value === null) return null;
  if (!isDynamicRecord(value) || !isString(value.fileName) || !isString(value.text))
    throw new Error("IPC returned an invalid section file.");
  return { fileName: value.fileName, text: value.text, preview: decodeAgentSectionPreview(value.preview) };
}

export function decodeImportAgentSectionResult(value: unknown): ImportAgentSectionResult {
  if (!isDynamicRecord(value) || !isNumber(value.agents)) throw new Error("IPC returned an invalid section import.");
  return { agents: value.agents };
}
