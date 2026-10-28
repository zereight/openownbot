import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/messaging";

export const messages = {
  "status.messaging.working": "Mee bezig…",
  "status.messaging.queued": "Even wachten: zereight bot werkt aan een ander verzoek. Het antwoord komt hier.",
  "status.messaging.busy": "Er wachten te veel verzoeken. Probeer het later opnieuw.",
  "status.messaging.failed": "zereight bot kon dit verzoek niet afronden. De zereight bot-host heeft de details.",
  "status.messaging.noAnswer": "zereight bot is klaar zonder geschreven antwoord.",
  "status.messaging.noAgent": "Er kan hier nog geen agent antwoorden. Voeg de Slack-orchestrator toe in zereight bot.",
  "status.messaging.delegated": "Een teamgenoot is ermee bezig. Het antwoord komt hier.",
  "status.messaging.stopped": "Gestopt.",
  "status.messaging.stop": "Stop",
  "status.messaging.approvalTitle": "zereight bot vraagt om goedkeuring om door te gaan.",
  "status.messaging.approvalCommand": "Een opdracht uitvoeren",
  "status.messaging.approvalFileChange": "Bestanden wijzigen",
  "status.messaging.approvalPermissions": "Meer machtigingen krijgen",
  "status.messaging.approve": "Goedkeuren",
  "status.messaging.deny": "Weigeren",
  "status.messaging.approvedBy": "Goedgekeurd door {user}.",
  "status.messaging.deniedBy": "Geweigerd door {user}.",
  "status.messaging.answeredOnHost": "Beantwoord op de zereight bot-host.",
  "status.messaging.requestInactive": "Dit verzoek is niet meer actief.",
  "status.messaging.onlyRequester": "Alleen {user} kan dit doen. De zereight bot-host kan ook antwoorden.",
  "status.messaging.hostOnly": "Alleen de zereight bot-host kan dit verzoek beantwoorden.",
  "status.messaging.filesSkipped": "Sommige bestanden zijn niet verstuurd: {names}.",
  "status.messaging.orchestratorName": "Slack-orchestrator",
  "status.messaging.orchestratorTitle": "Antwoordt in Slack en vraagt het team",
  "status.messaging.discordNoAgent":
    "Er kan hier nog geen agent antwoorden. Voeg de Discord-orchestrator toe in zereight bot.",
  "status.messaging.discordOrchestratorName": "Discord-orchestrator",
  "status.messaging.discordOrchestratorTitle": "Antwoordt in Discord en vraagt het team",
  "status.messaging.integrationsSection": "Integraties",
  "status.messaging.signInReceived": "zereight bot heeft de Slack-installatie ontvangen. Je kunt dit tabblad sluiten.",
  "status.messaging.signInUnknown":
    "zereight bot heeft deze Slack-installatie niet gestart. Start hem opnieuw in zereight bot.",
  "status.messaging.telegramNoAgent":
    "Er kan hier nog geen agent antwoorden. Voeg de Telegram-orchestrator toe in zereight bot.",
  "status.messaging.telegramLinked":
    "zereight bot is verbonden met deze chat. Noem {bot} of reageer op een bericht van zereight bot om de agents iets te vragen.",
  "status.messaging.telegramOrchestratorName": "Telegram-orchestrator",
  "status.messaging.telegramOrchestratorTitle": "Antwoordt in Telegram en vraagt het team",
} as const satisfies PartialTranslation<typeof source>;
