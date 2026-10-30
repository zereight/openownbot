import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "{count} agentes salvos em {file}.",
  "agentTeam.export.masked": "Valores que pareciam segredos foram ocultados em {count} agentes.",
  "agentTeam.export.failed": "Não foi possível exportar as seções.",
  "agentTeam.import.title": "Importar {name}",
  "agentTeam.import.summary": "Serão criados {agents} agentes em {sections} seções.",
  "agentTeam.import.renamed": "{count} nomes já estão em uso e receberão um número.",
  "agentTeam.import.contents": "Juntos eles incluem {skills} habilidades e {routines} rotinas.",
  "agentTeam.import.safety":
    "As habilidades começam desativadas e as rotinas em pausa. Os agentes que você já tem não são alterados.",
  "agentTeam.import.action": "Importar seções",
  "agentTeam.import.pending": "Importando…",
  "agentTeam.import.done": "{count} agentes importados.",
  "agentTeam.import.failed": "Não foi possível importar as seções. O que foi criado antes da falha permanece.",
  "agentTeam.problem.json": "Não é um arquivo de seções: o JSON não é válido.",
  "agentTeam.problem.format": "Não é um arquivo de seções.",
  "agentTeam.problem.version": "O arquivo é de uma versão mais recente e não pode ser lido.",
  "agentTeam.problem.tooLarge": "O arquivo é grande demais.",
  "agentTeam.problem.name": "O arquivo não tem um nome válido.",
  "agentTeam.problem.sections": "O arquivo não tem seções ou tem seções demais.",
  "agentTeam.problem.agents": "O arquivo tem agentes demais.",
  "agentTeam.problem.sectionName": "Uma seção não tem um nome válido: {name}",
  "agentTeam.problem.agent": "O agente {name} excede os limites.",
  "agentTeam.problem.marketplaceSkill":
    "O agente {name} usa uma habilidade do marketplace, que um arquivo de seções não pode conter.",
  "agentTeam.problem.duplicate": "Dois agentes se chamam {name}.",
} as const satisfies PartialTranslation<typeof source>;
