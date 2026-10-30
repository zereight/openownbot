import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/**
 * What team presence reaches in main: who is online, and whether this member is typing.
 */
export interface TeamPort {
  servers: Pick<OpenOwnBotDesktopApi["servers"], "onPresence" | "setTyping">;
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function teamPort(): TeamPort {
  return window.openownbot;
}
