import { defineMessages } from "../../message";

export const messages = defineMessages("agentSection", {
  "agentSection.export.done": "Saved {count} agents to {file}.",
  "agentSection.export.masked": "Values that looked like secrets were hidden in {count} agents.",
  "agentSection.export.failed": "Could not export the sections.",
  "agentSection.import.title": "Import {name}",
  "agentSection.import.summary": "{agents} agents in {sections} sections will be created.",
  "agentSection.import.renamed": "{count} names are already taken and get a number.",
  "agentSection.import.contents": "Together they carry {skills} skills and {routines} routines.",
  "agentSection.import.safety":
    "Skills start switched off and routines start paused. Agents you already have are not changed.",
  "agentSection.import.action": "Import sections",
  "agentSection.import.pending": "Importing…",
  "agentSection.import.done": "Imported {count} agents.",
  "agentSection.import.failed": "Could not import the sections. What was made before the failure stays.",
  "agentSection.problem.json": "The file is not a section file: it is not valid JSON.",
  "agentSection.problem.format": "The file is not a section file.",
  "agentSection.problem.version": "The file comes from a newer version and cannot be read.",
  "agentSection.problem.tooLarge": "The file is too large.",
  "agentSection.problem.name": "The file has no valid name.",
  "agentSection.problem.sections": "The file has too many sections or none.",
  "agentSection.problem.agents": "The file has too many agents.",
  "agentSection.problem.sectionName": "A section has no valid name: {name}",
  "agentSection.problem.agent": "The agent {name} does not fit the limits.",
  "agentSection.problem.marketplaceSkill":
    "The agent {name} uses a marketplace skill, which a section file cannot carry.",
  "agentSection.problem.duplicate": "Two agents are named {name}.",
});
