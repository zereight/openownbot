import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/**
 * What the account context reaches in main: the ROBot account session, its devices, and the
 * usage the page rail and the Usage page show.
 */
export interface AccountPort {
  agent: Pick<OpenOwnBotDesktopApi["agent"], "getUsage">;
  auth: Pick<
    OpenOwnBotDesktopApi["auth"],
    | "cancelMobileConnect"
    | "createMobileConnect"
    | "createMobileConnectLink"
    | "getMobileConnectLink"
    | "getState"
    | "listAccountSessions"
    | "listMobileConnectedDevices"
    | "logout"
    | "onEvent"
    | "requestEmailCode"
    | "retry"
    | "revokeAccountSession"
    | "revokeMobileConnectedDevice"
    | "revokeMobileConnectLink"
    | "updateAvatar"
    | "updateName"
    | "verifyEmailCode"
  >;
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function accountPort(): AccountPort {
  return window.openownbot;
}
