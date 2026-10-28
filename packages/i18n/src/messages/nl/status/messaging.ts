import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/messaging";

export const messages = {
  "status.messaging.working": "Mee bezig…",
  "status.messaging.queued": "Even wachten: OpenOwnBot werkt aan een ander verzoek. Het antwoord komt hier.",
  "status.messaging.busy": "Er wachten te veel verzoeken. Probeer het later opnieuw.",
  "status.messaging.failed": "OpenOwnBot kon dit verzoek niet afronden. De OpenOwnBot-host heeft de details.",
  "status.messaging.noAnswer": "OpenOwnBot is klaar zonder geschreven antwoord.",
  "status.messaging.noAgent": "Er kan hier nog geen agent antwoorden. Voeg de Slack-orchestrator toe in OpenOwnBot.",
  "status.messaging.delegated": "Een teamgenoot is ermee bezig. Het antwoord komt hier.",
  "status.messaging.stopped": "Gestopt.",
  "status.messaging.stop": "Stop",
  "status.messaging.approvalTitle": "OpenOwnBot vraagt om goedkeuring om door te gaan.",
  "status.messaging.approvalCommand": "Een opdracht uitvoeren",
  "status.messaging.approvalFileChange": "Bestanden wijzigen",
  "status.messaging.approvalPermissions": "Meer machtigingen krijgen",
  "status.messaging.approve": "Goedkeuren",
  "status.messaging.deny": "Weigeren",
  "status.messaging.approvedBy": "Goedgekeurd door {user}.",
  "status.messaging.deniedBy": "Geweigerd door {user}.",
  "status.messaging.answeredOnHost": "Beantwoord op de OpenOwnBot-host.",
  "status.messaging.requestInactive": "Dit verzoek is niet meer actief.",
  "status.messaging.onlyRequester": "Alleen {user} kan dit doen. De OpenOwnBot-host kan ook antwoorden.",
  "status.messaging.hostOnly": "Alleen de OpenOwnBot-host kan dit verzoek beantwoorden.",
  "status.messaging.filesSkipped": "Sommige bestanden zijn niet verstuurd: {names}.",
  "status.messaging.orchestratorName": "Slack-orchestrator",
  "status.messaging.orchestratorTitle": "Antwoordt in Slack en vraagt het team",
  "status.messaging.discordNoAgent":
    "Er kan hier nog geen agent antwoorden. Voeg de Discord-orchestrator toe in OpenOwnBot.",
  "status.messaging.discordOrchestratorName": "Discord-orchestrator",
  "status.messaging.discordOrchestratorTitle": "Antwoordt in Discord en vraagt het team",
  "status.messaging.integrationsSection": "Integraties",
  "status.messaging.signInReceived": "OpenOwnBot heeft de Slack-installatie ontvangen. Je kunt dit tabblad sluiten.",
  "status.messaging.signInUnknown":
    "OpenOwnBot heeft deze Slack-installatie niet gestart. Start hem opnieuw in OpenOwnBot.",
  "status.messaging.telegramNoAgent":
    "Er kan hier nog geen agent antwoorden. Voeg de Telegram-orchestrator toe in OpenOwnBot.",
  "status.messaging.telegramLinked":
    "OpenOwnBot is verbonden met deze chat. Noem {bot} of reageer op een bericht van OpenOwnBot om de agents iets te vragen.",
  "status.messaging.telegramOrchestratorName": "Telegram-orchestrator",
  "status.messaging.telegramOrchestratorTitle": "Antwoordt in Telegram en vraagt het team",
} as const satisfies PartialTranslation<typeof source>;
