import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "Zapisano {count} agentów w {file}.",
  "agentTeam.export.masked": "W {count} agentach ukryto wartości wyglądające na sekrety.",
  "agentTeam.export.failed": "Nie udało się wyeksportować sekcji.",
  "agentTeam.import.title": "Importuj {name}",
  "agentTeam.import.summary": "Zostanie utworzonych {agents} agentów w {sections} sekcjach.",
  "agentTeam.import.renamed": "{count} nazw jest już zajętych i dostanie numer.",
  "agentTeam.import.contents": "Razem zawierają {skills} umiejętności i {routines} rutyn.",
  "agentTeam.import.safety":
    "Umiejętności startują wyłączone, a rutyny wstrzymane. Istniejący agenci nie są zmieniani.",
  "agentTeam.import.action": "Importuj sekcje",
  "agentTeam.import.pending": "Importowanie…",
  "agentTeam.import.done": "Zaimportowano {count} agentów.",
  "agentTeam.import.failed": "Nie udało się zaimportować sekcji. To, co utworzono przed błędem, zostaje.",
  "agentTeam.problem.json": "To nie jest plik sekcji: nie jest poprawnym JSON-em.",
  "agentTeam.problem.format": "To nie jest plik sekcji.",
  "agentTeam.problem.version": "Plik pochodzi z nowszej wersji i nie można go odczytać.",
  "agentTeam.problem.tooLarge": "Plik jest za duży.",
  "agentTeam.problem.name": "Plik nie ma poprawnej nazwy.",
  "agentTeam.problem.sections": "Plik nie ma sekcji albo ma ich za dużo.",
  "agentTeam.problem.agents": "Plik zawiera zbyt wielu agentów.",
  "agentTeam.problem.sectionName": "Sekcja nie ma poprawnej nazwy: {name}",
  "agentTeam.problem.agent": "Agent {name} przekracza limity.",
  "agentTeam.problem.marketplaceSkill":
    "Agent {name} używa umiejętności z marketplace, której plik sekcji nie może zawierać.",
  "agentTeam.problem.duplicate": "Dwóch agentów nazywa się {name}.",
} as const satisfies PartialTranslation<typeof source>;
