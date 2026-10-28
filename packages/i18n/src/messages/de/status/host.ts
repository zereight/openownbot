import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/host";

export const messages = {
  "status.host.registered": "Dieser zereight bot wurde für den WebRTC-Zugriff registriert.",
  "status.host.keyRotated": "Serverschlüssel geändert. Gekoppelte Geräte bleiben gekoppelt.",
  "status.host.identityUpdated": "Serveridentität aktualisiert.",
  "status.host.starting": "WebRTC-Host wird gestartet…",
  "status.host.ready": "Dieser zereight bot ist für WebRTC-Verbindungen bereit.",
  "status.host.stopping": "Dieser zereight bot wird auf privat gesetzt…",
  "status.host.private": "Dieser zereight bot ist privat.",
} as const satisfies PartialTranslation<typeof source>;
