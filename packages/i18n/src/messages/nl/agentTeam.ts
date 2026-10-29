import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "{count} agenten opgeslagen in {file}.",
  "agentTeam.export.masked": "In {count} agenten zijn waarden verborgen die op geheimen leken.",
  "agentTeam.export.failed": "Het team kon niet worden geëxporteerd.",
  "agentTeam.import.title": "Team {name} importeren",
  "agentTeam.import.summary": "Er worden {agents} agenten aangemaakt in {sections} secties.",
  "agentTeam.import.renamed": "{count} namen zijn al in gebruik en krijgen een nummer.",
  "agentTeam.import.contents": "Samen bevatten ze {skills} skills en {routines} routines.",
  "agentTeam.import.safety":
    "Skills starten uitgeschakeld en routines gepauzeerd. Bestaande agenten worden niet gewijzigd.",
  "agentTeam.import.action": "Team importeren",
  "agentTeam.import.pending": "Importeren…",
  "agentTeam.import.done": "{count} agenten geïmporteerd.",
  "agentTeam.import.failed": "Het team kon niet worden geïmporteerd. Wat vóór de fout is aangemaakt, blijft staan.",
  "agentTeam.problem.json": "Dit is geen teambestand: het is geen geldige JSON.",
  "agentTeam.problem.format": "Dit is geen teambestand.",
  "agentTeam.problem.version": "Het bestand komt uit een nieuwere versie en kan niet worden gelezen.",
  "agentTeam.problem.tooLarge": "Het bestand is te groot.",
  "agentTeam.problem.name": "Het team heeft geen geldige naam.",
  "agentTeam.problem.sections": "Het bestand heeft geen of te veel secties.",
  "agentTeam.problem.agents": "Het bestand bevat te veel agenten.",
  "agentTeam.problem.sectionName": "Een sectie heeft geen geldige naam: {name}",
  "agentTeam.problem.agent": "De agent {name} past niet binnen de limieten.",
  "agentTeam.problem.marketplaceSkill":
    "De agent {name} gebruikt een marketplace-skill, die een teambestand niet kan bevatten.",
  "agentTeam.problem.duplicate": "Twee agenten heten {name}.",
} as const satisfies PartialTranslation<typeof source>;
