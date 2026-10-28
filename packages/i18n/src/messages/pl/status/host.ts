import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/host";

export const messages = {
  "status.host.registered": "Zarejestrowano ten OpenOwnBot do dostępu przez WebRTC.",
  "status.host.keyRotated": "Zmieniono klucz serwera. Sparowane urządzenia pozostają sparowane.",
  "status.host.identityUpdated": "Zaktualizowano tożsamość serwera.",
  "status.host.starting": "Uruchamianie hosta WebRTC…",
  "status.host.ready": "Ten OpenOwnBot jest gotowy na połączenia WebRTC.",
  "status.host.stopping": "Ustawianie tego serwera OpenOwnBot jako prywatnego…",
  "status.host.private": "Ten OpenOwnBot jest prywatny.",
} as const satisfies PartialTranslation<typeof source>;
