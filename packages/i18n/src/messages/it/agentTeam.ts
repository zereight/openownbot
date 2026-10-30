import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "{count} agenti salvati in {file}.",
  "agentTeam.export.masked": "In {count} agenti sono stati nascosti valori che sembravano segreti.",
  "agentTeam.export.failed": "Impossibile esportare le sezioni.",
  "agentTeam.import.title": "Importa {name}",
  "agentTeam.import.summary": "Verranno creati {agents} agenti in {sections} sezioni.",
  "agentTeam.import.renamed": "{count} nomi sono già in uso e riceveranno un numero.",
  "agentTeam.import.contents": "Insieme includono {skills} skill e {routines} routine.",
  "agentTeam.import.safety":
    "Le skill partono disattivate e le routine in pausa. Gli agenti già presenti non vengono modificati.",
  "agentTeam.import.action": "Importa sezioni",
  "agentTeam.import.pending": "Importazione…",
  "agentTeam.import.done": "Importati {count} agenti.",
  "agentTeam.import.failed": "Impossibile importare le sezioni. Ciò che è stato creato prima dell’errore resta.",
  "agentTeam.problem.json": "Non è un file di sezioni: non è un JSON valido.",
  "agentTeam.problem.format": "Non è un file di sezioni.",
  "agentTeam.problem.version": "Il file proviene da una versione più recente e non può essere letto.",
  "agentTeam.problem.tooLarge": "Il file è troppo grande.",
  "agentTeam.problem.name": "Il file non ha un nome valido.",
  "agentTeam.problem.sections": "Il file non ha sezioni o ne ha troppe.",
  "agentTeam.problem.agents": "Il file contiene troppi agenti.",
  "agentTeam.problem.sectionName": "Una sezione non ha un nome valido: {name}",
  "agentTeam.problem.agent": "L’agente {name} supera i limiti.",
  "agentTeam.problem.marketplaceSkill":
    "L’agente {name} usa una skill del marketplace, che un file di sezioni non può contenere.",
  "agentTeam.problem.duplicate": "Due agenti si chiamano {name}.",
} as const satisfies PartialTranslation<typeof source>;
