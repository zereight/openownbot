import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "{count} Agenten in {file} gespeichert.",
  "agentSection.export.masked": "In {count} Agenten wurden Werte ausgeblendet, die wie Geheimnisse aussahen.",
  "agentSection.export.failed": "Die Abschnitte konnten nicht exportiert werden.",
  "agentSection.import.title": "{name} importieren",
  "agentSection.import.summary": "Es werden {agents} Agenten in {sections} Bereichen erstellt.",
  "agentSection.import.renamed": "{count} Namen sind bereits vergeben und bekommen eine Nummer.",
  "agentSection.import.contents": "Zusammen enthalten sie {skills} Skills und {routines} Routinen.",
  "agentSection.import.safety":
    "Skills starten ausgeschaltet und Routinen pausiert. Bereits vorhandene Agenten werden nicht verändert.",
  "agentSection.import.action": "Abschnitte importieren",
  "agentSection.import.pending": "Wird importiert…",
  "agentSection.import.done": "{count} Agenten importiert.",
  "agentSection.import.failed":
    "Die Abschnitte konnten nicht importiert werden. Was vor dem Fehler erstellt wurde, bleibt erhalten.",
  "agentSection.problem.json": "Das ist keine Abschnittsdatei: Sie ist kein gültiges JSON.",
  "agentSection.problem.format": "Das ist keine Abschnittsdatei.",
  "agentSection.problem.version": "Die Datei stammt aus einer neueren Version und kann nicht gelesen werden.",
  "agentSection.problem.tooLarge": "Die Datei ist zu groß.",
  "agentSection.problem.name": "Die Datei hat keinen gültigen Namen.",
  "agentSection.problem.sections": "Die Datei hat keine oder zu viele Bereiche.",
  "agentSection.problem.agents": "Die Datei enthält zu viele Agenten.",
  "agentSection.problem.sectionName": "Ein Bereich hat keinen gültigen Namen: {name}",
  "agentSection.problem.agent": "Der Agent {name} überschreitet die Grenzen.",
  "agentSection.problem.marketplaceSkill":
    "Der Agent {name} nutzt einen Marketplace-Skill, den eine Abschnittsdatei nicht enthalten kann.",
  "agentSection.problem.duplicate": "Zwei Agenten heißen {name}.",
} as const satisfies PartialTranslation<typeof source>;
