import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/messaging";

export const messages = {
  // What the user can do about a Slack workspace connection that stopped.
  "messaging.help.invalid_token":
    "Slack artık bu çalışma alanında OpenOwnBot'u kabul etmiyor. Kaldırılmış olabilir. Çalışma alanını tekrar bağlayın.",
  "messaging.help.secret_storage_unavailable":
    "OpenOwnBot bu bilgisayardaki kayıtlı belirteçleri okuyamıyor. Çalışma alanı bağlantısını kesin, ardından tekrar bağlayın.",
  "messaging.help.relay_unavailable":
    "OpenOwnBot bu bilgisayarda Slack etkinliklerini alamıyor. Oturum açın, Sunucu ayarlarından bu bilgisayara bir ad verin ve OpenOwnBot'u açık tutun.",
  // Bir Discord sunucusu bağlantısı için aynı yardım.
  "messaging.discordHelp.invalid_token":
    "Discord artık bu Discord sunucusunda OpenOwnBot'u kabul etmiyor. Kaldırılmış olabilir. Discord sunucusunu tekrar bağlayın.",
  "messaging.discordHelp.secret_storage_unavailable":
    "OpenOwnBot bu bilgisayardaki kayıtlı belirteçleri okuyamıyor. Discord sunucusu bağlantısını kesin, ardından tekrar bağlayın.",
  "messaging.discordHelp.relay_unavailable":
    "OpenOwnBot bu bilgisayarda Discord etkinliklerini alamıyor. Oturum açın, Sunucu ayarlarından bu bilgisayara bir ad verin ve OpenOwnBot'u açık tutun.",
} as const satisfies PartialTranslation<typeof source>;
