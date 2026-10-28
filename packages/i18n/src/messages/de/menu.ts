import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/menu";

export const messages = {
  "menu.stopAllAgents": "Alle Agenten stoppen",
  "menu.checkForUpdates": "Nach Updates suchen…",
  "menu.preferences": "Einstellungen…",
  "menu.actualSize": "Originalgröße",
  "menu.zoomIn": "Vergrößern",
  "menu.zoomOut": "Verkleinern",
  "menu.copyLink": "Link kopieren",
  "menu.trayOpen": "OpenOwnBot öffnen",
  "menu.trayQuit": "OpenOwnBot beenden",
  "menu.trayTooltip": "OpenOwnBot",
} as const satisfies PartialTranslation<typeof source>;
