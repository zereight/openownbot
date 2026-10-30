import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "{count} agentes salvos em {file}.",
  "agentSection.export.masked": "Valores que pareciam segredos foram ocultados em {count} agentes.",
  "agentSection.export.failed": "Não foi possível exportar as seções.",
  "agentSection.import.title": "Importar {name}",
  "agentSection.import.summary": "Serão criados {agents} agentes em {sections} seções.",
  "agentSection.import.renamed": "{count} nomes já estão em uso e receberão um número.",
  "agentSection.import.contents": "Juntos eles incluem {skills} habilidades e {routines} rotinas.",
  "agentSection.import.safety":
    "As habilidades começam desativadas e as rotinas em pausa. Os agentes que você já tem não são alterados.",
  "agentSection.import.action": "Importar seções",
  "agentSection.import.pending": "Importando…",
  "agentSection.import.done": "{count} agentes importados.",
  "agentSection.import.failed": "Não foi possível importar as seções. O que foi criado antes da falha permanece.",
  "agentSection.problem.json": "Não é um arquivo de seções: o JSON não é válido.",
  "agentSection.problem.format": "Não é um arquivo de seções.",
  "agentSection.problem.version": "O arquivo é de uma versão mais recente e não pode ser lido.",
  "agentSection.problem.tooLarge": "O arquivo é grande demais.",
  "agentSection.problem.name": "O arquivo não tem um nome válido.",
  "agentSection.problem.sections": "O arquivo não tem seções ou tem seções demais.",
  "agentSection.problem.agents": "O arquivo tem agentes demais.",
  "agentSection.problem.sectionName": "Uma seção não tem um nome válido: {name}",
  "agentSection.problem.agent": "O agente {name} excede os limites.",
  "agentSection.problem.marketplaceSkill":
    "O agente {name} usa uma habilidade do marketplace, que um arquivo de seções não pode conter.",
  "agentSection.problem.duplicate": "Dois agentes se chamam {name}.",
} as const satisfies PartialTranslation<typeof source>;
