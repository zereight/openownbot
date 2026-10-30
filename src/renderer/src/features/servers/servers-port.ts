import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/**
 * What the servers domain reaches in main: the server list and selection, the account changes, the local host, the
 * settings of one server, the name, logo and update of a joined server's host, and the remote desktop
 * setup of a server.
 */
export interface ServersPort {
  agent: Pick<
    OpenOwnBotDesktopApi["agent"],
    | "getStatus"
    | "listAgents"
    | "listConversationReads"
    | "listHiddenAgents"
    | "listMcpServers"
    | "listModels"
    | "removeMcpServer"
    | "saveMcpServer"
    | "setMcpServerEnabled"
    | "testMcpServer"
    | "signInMcpServer"
    | "mcpSignInPage"
    | "mcpSignInRelay"
    | "openMcpSignInRelay"
    | "completeMcpSignInRelay"
    | "cancelMcpSignIn"
    | "signOutMcpServer"
    | "listMcpSignIns"
    | "mcpSignInApp"
    | "saveMcpSignInApp"
    | "removeMcpSignInApp"
  >;
  events: OpenOwnBotDesktopApi["events"];
  auth: Pick<OpenOwnBotDesktopApi["auth"], "onEvent">;
  browser: Pick<OpenOwnBotDesktopApi["browser"], "setVisible">;
  hostAdmin: Pick<
    OpenOwnBotDesktopApi["hostAdmin"],
    "cancelUpdate" | "getUpdateStatus" | "startUpdate" | "updateIdentity"
  >;
  hostedServers: Pick<OpenOwnBotDesktopApi["hostedServers"], "list" | "restart" | "wake">;
  host: Pick<
    OpenOwnBotDesktopApi["host"],
    | "configure"
    | "getStatus"
    | "onEvent"
    | "recheckScreenRecording"
    | "rotateIdentityKey"
    | "start"
    | "stop"
    | "updateIdentity"
  >;
  notifications: Pick<OpenOwnBotDesktopApi["notifications"], "onOpened">;
  remoteDesktop: Pick<
    OpenOwnBotDesktopApi["remoteDesktop"],
    "checkSetup" | "connect" | "disconnect" | "list" | "openSetup" | "test"
  >;
  servers: Pick<
    OpenOwnBotDesktopApi["servers"],
    | "getPresenceFor"
    | "list"
    | "onEvent"
    | "onPresence"
    | "refreshIdentity"
    | "remove"
    | "reorder"
    | "retryConnection"
    | "select"
    | "setMuted"
    | "setNotificationLevel"
  >;
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function serversPort(): ServersPort {
  return window.openownbot;
}
