import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "Se guardaron {count} agentes en {file}.",
  "agentTeam.export.masked": "Se ocultaron valores que parecían secretos en {count} agentes.",
  "agentTeam.export.failed": "No se pudieron exportar las secciones.",
  "agentTeam.import.title": "Importar {name}",
  "agentTeam.import.summary": "Se crearán {agents} agentes en {sections} secciones.",
  "agentTeam.import.renamed": "{count} nombres ya están en uso y recibirán un número.",
  "agentTeam.import.contents": "Juntos incluyen {skills} habilidades y {routines} rutinas.",
  "agentTeam.import.safety":
    "Las habilidades empiezan desactivadas y las rutinas en pausa. Los agentes que ya tienes no cambian.",
  "agentTeam.import.action": "Importar secciones",
  "agentTeam.import.pending": "Importando…",
  "agentTeam.import.done": "Se importaron {count} agentes.",
  "agentTeam.import.failed": "No se pudieron importar las secciones. Lo creado antes del fallo se conserva.",
  "agentTeam.problem.json": "No es un archivo de secciones: no es un JSON válido.",
  "agentTeam.problem.format": "No es un archivo de secciones.",
  "agentTeam.problem.version": "El archivo es de una versión más reciente y no se puede leer.",
  "agentTeam.problem.tooLarge": "El archivo es demasiado grande.",
  "agentTeam.problem.name": "El archivo no tiene un nombre válido.",
  "agentTeam.problem.sections": "El archivo no tiene secciones o tiene demasiadas.",
  "agentTeam.problem.agents": "El archivo tiene demasiados agentes.",
  "agentTeam.problem.sectionName": "Una sección no tiene un nombre válido: {name}",
  "agentTeam.problem.agent": "El agente {name} supera los límites.",
  "agentTeam.problem.marketplaceSkill":
    "El agente {name} usa una habilidad del marketplace, que un archivo de secciones no puede incluir.",
  "agentTeam.problem.duplicate": "Hay dos agentes llamados {name}.",
} as const satisfies PartialTranslation<typeof source>;
