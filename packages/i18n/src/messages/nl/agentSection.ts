import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "{count} agenten opgeslagen in {file}.",
  "agentSection.export.masked": "In {count} agenten zijn waarden verborgen die op geheimen leken.",
  "agentSection.export.failed": "De secties konden niet worden geëxporteerd.",
  "agentSection.import.title": "{name} importeren",
  "agentSection.import.summary": "Er worden {agents} agenten aangemaakt in {sections} secties.",
  "agentSection.import.renamed": "{count} namen zijn al in gebruik en krijgen een nummer.",
  "agentSection.import.contents": "Samen bevatten ze {skills} skills en {routines} routines.",
  "agentSection.import.safety":
    "Skills starten uitgeschakeld en routines gepauzeerd. Bestaande agenten worden niet gewijzigd.",
  "agentSection.import.action": "Secties importeren",
  "agentSection.import.pending": "Importeren…",
  "agentSection.import.done": "{count} agenten geïmporteerd.",
  "agentSection.import.failed":
    "De secties konden niet worden geïmporteerd. Wat vóór de fout is aangemaakt, blijft staan.",
  "agentSection.problem.json": "Dit is geen sectiebestand: het is geen geldige JSON.",
  "agentSection.problem.format": "Dit is geen sectiebestand.",
  "agentSection.problem.version": "Het bestand komt uit een nieuwere versie en kan niet worden gelezen.",
  "agentSection.problem.tooLarge": "Het bestand is te groot.",
  "agentSection.problem.name": "Het bestand heeft geen geldige naam.",
  "agentSection.problem.sections": "Het bestand heeft geen of te veel secties.",
  "agentSection.problem.agents": "Het bestand bevat te veel agenten.",
  "agentSection.problem.sectionName": "Een sectie heeft geen geldige naam: {name}",
  "agentSection.problem.agent": "De agent {name} past niet binnen de limieten.",
  "agentSection.problem.marketplaceSkill":
    "De agent {name} gebruikt een marketplace-skill, die een sectiebestand niet kan bevatten.",
  "agentSection.problem.duplicate": "Twee agenten heten {name}.",
} as const satisfies PartialTranslation<typeof source>;
