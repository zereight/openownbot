import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/messaging";

export const messages = {
  "status.messaging.working": "Trabalhando nisso…",
  "status.messaging.queued": "Aguardando: o zereight bot está atendendo outra solicitação. A resposta chegará aqui.",
  "status.messaging.busy": "Há muitas solicitações na fila. Tente novamente mais tarde.",
  "status.messaging.failed":
    "O zereight bot não conseguiu concluir esta solicitação. Os detalhes estão no computador anfitrião do zereight bot.",
  "status.messaging.noAnswer": "O zereight bot terminou sem uma resposta por escrito.",
  "status.messaging.noAgent":
    "Nenhum agente pode responder aqui ainda. Adicione o Orquestrador do Slack no zereight bot.",
  "status.messaging.delegated": "Um colega está trabalhando nisso. A resposta chegará aqui.",
  "status.messaging.stopped": "Interrompido.",
  "status.messaging.stop": "Parar",
  "status.messaging.approvalTitle": "O zereight bot pede aprovação para continuar.",
  "status.messaging.approvalCommand": "Executar um comando",
  "status.messaging.approvalFileChange": "Alterar arquivos",
  "status.messaging.approvalPermissions": "Obter mais permissões",
  "status.messaging.approve": "Aprovar",
  "status.messaging.deny": "Negar",
  "status.messaging.approvedBy": "Aprovado por {user}.",
  "status.messaging.deniedBy": "Negado por {user}.",
  "status.messaging.answeredOnHost": "Respondido no computador anfitrião do zereight bot.",
  "status.messaging.requestInactive": "Esta solicitação não está mais ativa.",
  "status.messaging.onlyRequester":
    "Somente {user} pode fazer isso. Também é possível responder no computador anfitrião do zereight bot.",
  "status.messaging.hostOnly": "Esta solicitação só pode ser respondida no computador anfitrião do zereight bot.",
  "status.messaging.filesSkipped": "Alguns arquivos não foram enviados: {names}.",
  "status.messaging.orchestratorName": "Orquestrador do Slack",
  "status.messaging.orchestratorTitle": "Responde no Slack e consulta a equipe",
  "status.messaging.discordNoAgent":
    "Nenhum agente pode responder aqui ainda. Adicione o Orquestrador do Discord no zereight bot.",
  "status.messaging.discordOrchestratorName": "Orquestrador do Discord",
  "status.messaging.discordOrchestratorTitle": "Responde no Discord e consulta a equipe",
  "status.messaging.integrationsSection": "Integrações",
  "status.messaging.signInReceived": "O zereight bot recebeu a instalação do Slack. Você pode fechar esta aba.",
  "status.messaging.signInUnknown":
    "O zereight bot não iniciou esta instalação do Slack. Inicie a instalação novamente no zereight bot.",
  "status.messaging.telegramNoAgent":
    "Nenhum agente pode responder aqui ainda. Adicione o Orquestrador do Telegram no zereight bot.",
  "status.messaging.telegramLinked":
    "O zereight bot está conectado a este chat. Mencione {bot} ou responda a uma mensagem do zereight bot para falar com os agentes.",
  "status.messaging.telegramOrchestratorName": "Orquestrador do Telegram",
  "status.messaging.telegramOrchestratorTitle": "Responde no Telegram e consulta a equipe",
} as const satisfies PartialTranslation<typeof source>;
