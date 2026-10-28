import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/host";

export const messages = {
  "status.host.registered": "Bu zereight bot, WebRTC erişimi için kaydedildi.",
  "status.host.keyRotated": "Sunucu anahtarı değiştirildi. Eşlenmiş cihazlar eşli kalır.",
  "status.host.identityUpdated": "Sunucu kimliği güncellendi.",
  "status.host.starting": "WebRTC ana makinesi başlatılıyor…",
  "status.host.ready": "Bu zereight bot, WebRTC bağlantıları için hazır.",
  "status.host.stopping": "Bu zereight bot özel yapılıyor…",
  "status.host.private": "Bu zereight bot özel.",
} as const satisfies PartialTranslation<typeof source>;
