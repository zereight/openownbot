import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/**
 * What the sidebar reaches in main: the saved sidebar layout and its changes, and the free space
 * on the disk of a server for the storage card.
 */
export interface SidebarPort {
  agent: Pick<OpenOwnBotDesktopApi["agent"], "getSidebarLayout" | "mutateSidebarLayout">;
  storage: Pick<OpenOwnBotDesktopApi["storage"], "getDisk">;
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function sidebarPort(): SidebarPort {
  return window.openownbot;
}
