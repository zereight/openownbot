import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/**
 * What the remote desktop context reaches in main: the sessions this computer holds to other
 * servers.
 */
export interface RemoteDesktopPort {
  remoteDesktop: Pick<
    OpenOwnBotDesktopApi["remoteDesktop"],
    "connect" | "disconnect" | "list" | "onEvent" | "selectDisplay"
  >;
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function remoteDesktopPort(): RemoteDesktopPort {
  return window.openownbot;
}
