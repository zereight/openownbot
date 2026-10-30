import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "Se guardaron {count} agentes en {file}.",
  "agentSection.export.masked": "Se ocultaron valores que parecían secretos en {count} agentes.",
  "agentSection.export.failed": "No se pudieron exportar las secciones.",
  "agentSection.import.title": "Importar {name}",
  "agentSection.import.summary": "Se crearán {agents} agentes en {sections} secciones.",
  "agentSection.import.renamed": "{count} nombres ya están en uso y recibirán un número.",
  "agentSection.import.contents": "Juntos incluyen {skills} habilidades y {routines} rutinas.",
  "agentSection.import.safety":
    "Las habilidades empiezan desactivadas y las rutinas en pausa. Los agentes que ya tienes no cambian.",
  "agentSection.import.action": "Importar secciones",
  "agentSection.import.pending": "Importando…",
  "agentSection.import.done": "Se importaron {count} agentes.",
  "agentSection.import.failed": "No se pudieron importar las secciones. Lo creado antes del fallo se conserva.",
  "agentSection.problem.json": "No es un archivo de secciones: no es un JSON válido.",
  "agentSection.problem.format": "No es un archivo de secciones.",
  "agentSection.problem.version": "El archivo es de una versión más reciente y no se puede leer.",
  "agentSection.problem.tooLarge": "El archivo es demasiado grande.",
  "agentSection.problem.name": "El archivo no tiene un nombre válido.",
  "agentSection.problem.sections": "El archivo no tiene secciones o tiene demasiadas.",
  "agentSection.problem.agents": "El archivo tiene demasiados agentes.",
  "agentSection.problem.sectionName": "Una sección no tiene un nombre válido: {name}",
  "agentSection.problem.agent": "El agente {name} supera los límites.",
  "agentSection.problem.marketplaceSkill":
    "El agente {name} usa una habilidad del marketplace, que un archivo de secciones no puede incluir.",
  "agentSection.problem.duplicate": "Hay dos agentes llamados {name}.",
} as const satisfies PartialTranslation<typeof source>;
