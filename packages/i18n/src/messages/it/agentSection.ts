import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "{count} agenti salvati in {file}.",
  "agentSection.export.masked": "In {count} agenti sono stati nascosti valori che sembravano segreti.",
  "agentSection.export.failed": "Impossibile esportare le sezioni.",
  "agentSection.import.title": "Importa {name}",
  "agentSection.import.summary": "Verranno creati {agents} agenti in {sections} sezioni.",
  "agentSection.import.renamed": "{count} nomi sono già in uso e riceveranno un numero.",
  "agentSection.import.contents": "Insieme includono {skills} skill e {routines} routine.",
  "agentSection.import.safety":
    "Le skill partono disattivate e le routine in pausa. Gli agenti già presenti non vengono modificati.",
  "agentSection.import.action": "Importa sezioni",
  "agentSection.import.pending": "Importazione…",
  "agentSection.import.done": "Importati {count} agenti.",
  "agentSection.import.failed": "Impossibile importare le sezioni. Ciò che è stato creato prima dell’errore resta.",
  "agentSection.problem.json": "Non è un file di sezioni: non è un JSON valido.",
  "agentSection.problem.format": "Non è un file di sezioni.",
  "agentSection.problem.version": "Il file proviene da una versione più recente e non può essere letto.",
  "agentSection.problem.tooLarge": "Il file è troppo grande.",
  "agentSection.problem.name": "Il file non ha un nome valido.",
  "agentSection.problem.sections": "Il file non ha sezioni o ne ha troppe.",
  "agentSection.problem.agents": "Il file contiene troppi agenti.",
  "agentSection.problem.sectionName": "Una sezione non ha un nome valido: {name}",
  "agentSection.problem.agent": "L’agente {name} supera i limiti.",
  "agentSection.problem.marketplaceSkill":
    "L’agente {name} usa una skill del marketplace, che un file di sezioni non può contenere.",
  "agentSection.problem.duplicate": "Due agenti si chiamano {name}.",
} as const satisfies PartialTranslation<typeof source>;
