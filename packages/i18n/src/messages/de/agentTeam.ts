import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "{count} Agenten in {file} gespeichert.",
  "agentTeam.export.masked": "In {count} Agenten wurden Werte ausgeblendet, die wie Geheimnisse aussahen.",
  "agentTeam.export.failed": "Das Team konnte nicht exportiert werden.",
  "agentTeam.import.title": "Team {name} importieren",
  "agentTeam.import.summary": "Es werden {agents} Agenten in {sections} Bereichen erstellt.",
  "agentTeam.import.renamed": "{count} Namen sind bereits vergeben und bekommen eine Nummer.",
  "agentTeam.import.contents": "Zusammen enthalten sie {skills} Skills und {routines} Routinen.",
  "agentTeam.import.safety":
    "Skills starten ausgeschaltet und Routinen pausiert. Bereits vorhandene Agenten werden nicht verändert.",
  "agentTeam.import.action": "Team importieren",
  "agentTeam.import.pending": "Wird importiert…",
  "agentTeam.import.done": "{count} Agenten importiert.",
  "agentTeam.import.failed":
    "Das Team konnte nicht importiert werden. Was vor dem Fehler erstellt wurde, bleibt erhalten.",
  "agentTeam.problem.json": "Das ist keine Team-Datei: Sie ist kein gültiges JSON.",
  "agentTeam.problem.format": "Das ist keine Team-Datei.",
  "agentTeam.problem.version": "Die Datei stammt aus einer neueren Version und kann nicht gelesen werden.",
  "agentTeam.problem.tooLarge": "Die Datei ist zu groß.",
  "agentTeam.problem.name": "Das Team hat keinen gültigen Namen.",
  "agentTeam.problem.sections": "Die Datei hat keine oder zu viele Bereiche.",
  "agentTeam.problem.agents": "Die Datei enthält zu viele Agenten.",
  "agentTeam.problem.sectionName": "Ein Bereich hat keinen gültigen Namen: {name}",
  "agentTeam.problem.agent": "Der Agent {name} überschreitet die Grenzen.",
  "agentTeam.problem.marketplaceSkill":
    "Der Agent {name} nutzt einen Marketplace-Skill, den eine Team-Datei nicht enthalten kann.",
  "agentTeam.problem.duplicate": "Zwei Agenten heißen {name}.",
  "agentTeam.manage.title": "Teams",
  "agentTeam.manage.description":
    "Ein Team hat einen Lead. Mitglieder sprechen frei miteinander. Nur der Lead schreibt an Agenten außerhalb des Teams, und Agenten außerhalb erreichen das Team über seinen Lead.",
  "agentTeam.manage.empty": "Noch keine Teams. Agenten ohne Team sind nicht eingeschränkt.",
  "agentTeam.manage.new": "Neues Team",
  "agentTeam.manage.edit": "Bearbeiten",
  "agentTeam.manage.delete": "Löschen",
  "agentTeam.manage.back": "Zurück",
  "agentTeam.manage.name": "Teamname",
  "agentTeam.manage.lead": "Lead",
  "agentTeam.manage.members": "Mitglieder",
  "agentTeam.manage.ranks": "Ränge",
  "agentTeam.manage.ranksPlaceholder": "Senior, Junior, Praktikant",
  "agentTeam.manage.ranksHint":
    "Der höchste zuerst, durch Kommas getrennt. Die Leitung steht über allen Rängen. Ein Mitglied schreibt an den eigenen Rang und darunter, nach oben nur an den Rang direkt darüber.",
  "agentTeam.manage.rankOf": "Rang von {agent}",
  "agentTeam.manage.noRank": "Kein Rang",
  "agentTeam.manage.save": "Speichern",
  "agentTeam.manage.saving": "Wird gespeichert…",
  "agentTeam.manage.summary": "Lead: {lead}. Mitglieder: {count}.",
  "agentTeam.manage.saveFailed": "Das Team konnte nicht gespeichert werden.",
  "agentTeam.manage.deleteFailed": "Das Team konnte nicht gelöscht werden.",
  "agentTeam.manage.loadFailed": "Die Teams konnten nicht geladen werden.",
} as const satisfies PartialTranslation<typeof source>;
