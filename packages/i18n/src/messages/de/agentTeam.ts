import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "{count} Agenten in {file} gespeichert.",
  "agentTeam.export.masked": "In {count} Agenten wurden Werte ausgeblendet, die wie Geheimnisse aussahen.",
  "agentTeam.export.failed": "Die Abschnitte konnten nicht exportiert werden.",
  "agentTeam.import.title": "{name} importieren",
  "agentTeam.import.summary": "Es werden {agents} Agenten in {sections} Bereichen erstellt.",
  "agentTeam.import.renamed": "{count} Namen sind bereits vergeben und bekommen eine Nummer.",
  "agentTeam.import.contents": "Zusammen enthalten sie {skills} Skills und {routines} Routinen.",
  "agentTeam.import.safety":
    "Skills starten ausgeschaltet und Routinen pausiert. Bereits vorhandene Agenten werden nicht verändert.",
  "agentTeam.import.action": "Abschnitte importieren",
  "agentTeam.import.pending": "Wird importiert…",
  "agentTeam.import.done": "{count} Agenten importiert.",
  "agentTeam.import.failed":
    "Die Abschnitte konnten nicht importiert werden. Was vor dem Fehler erstellt wurde, bleibt erhalten.",
  "agentTeam.problem.json": "Das ist keine Abschnittsdatei: Sie ist kein gültiges JSON.",
  "agentTeam.problem.format": "Das ist keine Abschnittsdatei.",
  "agentTeam.problem.version": "Die Datei stammt aus einer neueren Version und kann nicht gelesen werden.",
  "agentTeam.problem.tooLarge": "Die Datei ist zu groß.",
  "agentTeam.problem.name": "Die Datei hat keinen gültigen Namen.",
  "agentTeam.problem.sections": "Die Datei hat keine oder zu viele Bereiche.",
  "agentTeam.problem.agents": "Die Datei enthält zu viele Agenten.",
  "agentTeam.problem.sectionName": "Ein Bereich hat keinen gültigen Namen: {name}",
  "agentTeam.problem.agent": "Der Agent {name} überschreitet die Grenzen.",
  "agentTeam.problem.marketplaceSkill":
    "Der Agent {name} nutzt einen Marketplace-Skill, den eine Abschnittsdatei nicht enthalten kann.",
  "agentTeam.problem.duplicate": "Zwei Agenten heißen {name}.",
} as const satisfies PartialTranslation<typeof source>;
