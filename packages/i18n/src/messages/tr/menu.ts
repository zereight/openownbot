import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/menu";

export const messages = {
  "menu.stopAllAgents": "Tüm ajanları durdur",
  "menu.checkForUpdates": "Güncellemeleri Denetle…",
  "menu.preferences": "Ayarlar…",
  "menu.actualSize": "Gerçek Boyut",
  "menu.zoomIn": "Yakınlaştır",
  "menu.zoomOut": "Uzaklaştır",
  "menu.copyLink": "Bağlantıyı Kopyala",
  "menu.trayOpen": "OpenOwnBot'u aç",
  "menu.trayQuit": "OpenOwnBot'tan çık",
  "menu.trayTooltip": "OpenOwnBot",
} as const satisfies PartialTranslation<typeof source>;
