import { INPUT_LIMITS } from "./input-limits";
import { type AgentTemplateSnapshot, isAgentTemplateSnapshot, toAgentTemplateSnapshot } from "./ipc-agent-templates";
import { isDynamicRecord, isString } from "./runtime-values";

/**
 * A section file holds the agents of some sidebar sections in one text file, to move them to another
 * computer. Each agent is an `AgentTemplateSnapshot`: its name, title, instructions, skills and
 * routines. The type has no field for a model, a folder, an access level, a key or a conversation,
 * so a file cannot carry them and an import cannot widen what an agent may do.
 */
// Written into every saved file, so it keeps the name from before the rename: a file saved earlier must still import.
export const AGENT_SECTION_FILE_FORMAT = "agent-team";
export const AGENT_SECTION_FILE_VERSION = 1;

export const AGENT_SECTION_FILE_LIMITS = {
  sections: 16,
  agents: 40,
  /** The text of the whole file, before it is read as JSON. */
  bytes: 10_000_000,
} as const;

export interface SectionFileEntry {
  name: string;
  agents: AgentTemplateSnapshot[];
}

export interface AgentSectionFile {
  format: typeof AGENT_SECTION_FILE_FORMAT;
  version: typeof AGENT_SECTION_FILE_VERSION;
  name: string;
  sections: SectionFileEntry[];
}

/** Why a file cannot be imported. Main turns it into words. */
export type AgentSectionFileProblem =
  | { kind: "json" | "format" | "version" | "tooLarge" | "name" | "sections" | "agents" }
  | { kind: "sectionName"; section: string }
  | { kind: "agent" | "marketplaceSkill" | "duplicate"; agent: string };

export type AgentSectionFileResult =
  | { ok: true; file: AgentSectionFile }
  | { ok: false; problem: AgentSectionFileProblem };

export function buildAgentSectionFile(name: string, sections: readonly SectionFileEntry[]): AgentSectionFile {
  return {
    format: AGENT_SECTION_FILE_FORMAT,
    version: AGENT_SECTION_FILE_VERSION,
    name: name.trim(),
    sections: sections.map((section) => ({
      name: section.name.trim(),
      agents: section.agents.map(toAgentTemplateSnapshot),
    })),
  };
}

function fail(problem: AgentSectionFileProblem): AgentSectionFileResult {
  return { ok: false, problem };
}

function validName(value: unknown, limit: number): value is string {
  return isString(value) && value.trim().length > 0 && value.length <= limit;
}

/**
 * Reads a section file from text. Unknown keys never reach the result: the agents are copied field by
 * field. A marketplace skill is refused because installing it needs the account service.
 */
export function parseAgentSectionFile(text: string): AgentSectionFileResult {
  if (new TextEncoder().encode(text).byteLength > AGENT_SECTION_FILE_LIMITS.bytes) return fail({ kind: "tooLarge" });
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail({ kind: "json" });
  }
  if (!isDynamicRecord(value) || value.format !== AGENT_SECTION_FILE_FORMAT) return fail({ kind: "format" });
  if (value.version !== AGENT_SECTION_FILE_VERSION) return fail({ kind: "version" });
  if (!validName(value.name, INPUT_LIMITS.agentName)) return fail({ kind: "name" });
  const rawSections = value.sections;
  if (!Array.isArray(rawSections) || rawSections.length > AGENT_SECTION_FILE_LIMITS.sections)
    return fail({ kind: "sections" });
  const seen = new Set<string>();
  const sections: SectionFileEntry[] = [];
  let count = 0;
  for (const raw of rawSections) {
    if (!isDynamicRecord(raw) || !validName(raw.name, INPUT_LIMITS.sidebarSectionName))
      return fail({ kind: "sectionName", section: isDynamicRecord(raw) && isString(raw.name) ? raw.name : "" });
    if (!Array.isArray(raw.agents)) return fail({ kind: "agents" });
    const agents: AgentTemplateSnapshot[] = [];
    for (const item of raw.agents) {
      count += 1;
      if (count > AGENT_SECTION_FILE_LIMITS.agents) return fail({ kind: "agents" });
      const label = isDynamicRecord(item) && isString(item.name) ? item.name : "";
      if (isDynamicRecord(item) && Array.isArray(item.skills)) {
        const marketplace = item.skills.some((skill) => isDynamicRecord(skill) && skill.kind === "marketplace");
        if (marketplace) return fail({ kind: "marketplaceSkill", agent: label });
      }
      if (!isAgentTemplateSnapshot(item)) return fail({ kind: "agent", agent: label });
      const snapshot = toAgentTemplateSnapshot(item);
      if (seen.has(snapshot.name)) return fail({ kind: "duplicate", agent: snapshot.name });
      seen.add(snapshot.name);
      agents.push(snapshot);
    }
    sections.push({ name: raw.name.trim(), agents });
  }
  return { ok: true, file: buildAgentSectionFile(value.name, sections) };
}
