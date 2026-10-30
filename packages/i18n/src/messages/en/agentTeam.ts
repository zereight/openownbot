import { defineMessages } from "../../message";

export const messages = defineMessages("agentTeam", {
  "agentTeam.export.done": "Saved {count} agents to {file}.",
  "agentTeam.export.masked": "Values that looked like secrets were hidden in {count} agents.",
  "agentTeam.export.failed": "Could not export the sections.",
  "agentTeam.import.title": "Import {name}",
  "agentTeam.import.summary": "{agents} agents in {sections} sections will be created.",
  "agentTeam.import.renamed": "{count} names are already taken and get a number.",
  "agentTeam.import.contents": "Together they carry {skills} skills and {routines} routines.",
  "agentTeam.import.safety":
    "Skills start switched off and routines start paused. Agents you already have are not changed.",
  "agentTeam.import.action": "Import sections",
  "agentTeam.import.pending": "Importing…",
  "agentTeam.import.done": "Imported {count} agents.",
  "agentTeam.import.failed": "Could not import the sections. What was made before the failure stays.",
  "agentTeam.problem.json": "The file is not a section file: it is not valid JSON.",
  "agentTeam.problem.format": "The file is not a section file.",
  "agentTeam.problem.version": "The file comes from a newer version and cannot be read.",
  "agentTeam.problem.tooLarge": "The file is too large.",
  "agentTeam.problem.name": "The file has no valid name.",
  "agentTeam.problem.sections": "The file has too many sections or none.",
  "agentTeam.problem.agents": "The file has too many agents.",
  "agentTeam.problem.sectionName": "A section has no valid name: {name}",
  "agentTeam.problem.agent": "The agent {name} does not fit the limits.",
  "agentTeam.problem.marketplaceSkill": "The agent {name} uses a marketplace skill, which a section file cannot carry.",
  "agentTeam.problem.duplicate": "Two agents are named {name}.",
});
