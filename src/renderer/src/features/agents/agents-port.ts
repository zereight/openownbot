import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/**
 * What the agents domain reaches in main: agent records, their models and read state, and the agent
 * event stream.
 */
export interface AgentsPort {
  agent: Pick<
    OpenOwnBotDesktopApi["agent"],
    | "createAgent"
    | "deleteAgent"
    | "duplicateAgent"
    | "getAgentAdminSettings"
    | "getAgentHostSettings"
    | "updateAgentHostSettings"
    | "getAgentBackupModels"
    | "updateAgentBackupModels"
    | "getAgentTaskLimit"
    | "updateAgentTaskLimit"
    | "listAgents"
    | "listConversationReads"
    | "listModels"
    | "onEvent"
    | "getRuntimeSnapshot"
    | "setAgentHidden"
    | "setAvatar"
    | "updateAgent"
    | "updateAgentAdminSettings"
  >;
  /** The accounts of a joined server's providers, which its released agent routes do not carry. */
  providerAdmin: Pick<OpenOwnBotDesktopApi["providerAdmin"], "accounts" | "accountUsage">;
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function agentsPort(): AgentsPort {
  return window.openownbot;
}
