import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "Zapisano {count} agentów w {file}.",
  "agentSection.export.masked": "W {count} agentach ukryto wartości wyglądające na sekrety.",
  "agentSection.export.failed": "Nie udało się wyeksportować sekcji.",
  "agentSection.import.title": "Importuj {name}",
  "agentSection.import.summary": "Zostanie utworzonych {agents} agentów w {sections} sekcjach.",
  "agentSection.import.renamed": "{count} nazw jest już zajętych i dostanie numer.",
  "agentSection.import.contents": "Razem zawierają {skills} umiejętności i {routines} rutyn.",
  "agentSection.import.safety":
    "Umiejętności startują wyłączone, a rutyny wstrzymane. Istniejący agenci nie są zmieniani.",
  "agentSection.import.action": "Importuj sekcje",
  "agentSection.import.pending": "Importowanie…",
  "agentSection.import.done": "Zaimportowano {count} agentów.",
  "agentSection.import.failed": "Nie udało się zaimportować sekcji. To, co utworzono przed błędem, zostaje.",
  "agentSection.problem.json": "To nie jest plik sekcji: nie jest poprawnym JSON-em.",
  "agentSection.problem.format": "To nie jest plik sekcji.",
  "agentSection.problem.version": "Plik pochodzi z nowszej wersji i nie można go odczytać.",
  "agentSection.problem.tooLarge": "Plik jest za duży.",
  "agentSection.problem.name": "Plik nie ma poprawnej nazwy.",
  "agentSection.problem.sections": "Plik nie ma sekcji albo ma ich za dużo.",
  "agentSection.problem.agents": "Plik zawiera zbyt wielu agentów.",
  "agentSection.problem.sectionName": "Sekcja nie ma poprawnej nazwy: {name}",
  "agentSection.problem.agent": "Agent {name} przekracza limity.",
  "agentSection.problem.marketplaceSkill":
    "Agent {name} używa umiejętności z marketplace, której plik sekcji nie może zawierać.",
  "agentSection.problem.duplicate": "Dwóch agentów nazywa się {name}.",
} as const satisfies PartialTranslation<typeof source>;
