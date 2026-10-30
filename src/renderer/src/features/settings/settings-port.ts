import type { OpenOwnBotDesktopApi } from "@openownbot/contracts/ipc";

/**
 * What the settings context reaches in main: the app-wide preferences, the switches for updates,
 * notifications and the Dynamic Island, the local agents of the Agents tab, and the hidden agents and
 * archived channels of the Archive tab. The Titles tab reads and updates the local agents too. The
 * General tab opens the logs folder.
 */
export interface SettingsPort {
  getAgentDefaults: OpenOwnBotDesktopApi["getAgentDefaults"];
  getAgentMemoryLimitPreference: OpenOwnBotDesktopApi["getAgentMemoryLimitPreference"];
  getAppBehaviorPreference: OpenOwnBotDesktopApi["getAppBehaviorPreference"];
  getApprovalAutomation: OpenOwnBotDesktopApi["getApprovalAutomation"];
  getBusyMessageModePreference: OpenOwnBotDesktopApi["getBusyMessageModePreference"];
  getExternalLinkPreference: OpenOwnBotDesktopApi["getExternalLinkPreference"];
  listExternalLinkBrowsers: OpenOwnBotDesktopApi["listExternalLinkBrowsers"];
  chooseExternalLinkApp: OpenOwnBotDesktopApi["chooseExternalLinkApp"];
  onExternalLinkFallback: OpenOwnBotDesktopApi["onExternalLinkFallback"];
  getRemoteNetworkRoute: OpenOwnBotDesktopApi["getRemoteNetworkRoute"];
  getRemoteSessionReusePreference: OpenOwnBotDesktopApi["getRemoteSessionReusePreference"];
  onAgentMemoryLimitPreference: OpenOwnBotDesktopApi["onAgentMemoryLimitPreference"];
  onApprovalAutomation: OpenOwnBotDesktopApi["onApprovalAutomation"];
  onOpenSettings: OpenOwnBotDesktopApi["onOpenSettings"];
  onOpenUpdateSettings: OpenOwnBotDesktopApi["onOpenUpdateSettings"];
  setAgentDefaults: OpenOwnBotDesktopApi["setAgentDefaults"];
  setAppBehaviorPreference: OpenOwnBotDesktopApi["setAppBehaviorPreference"];
  setBusyMessageModePreference: OpenOwnBotDesktopApi["setBusyMessageModePreference"];
  setExternalLinkPreference: OpenOwnBotDesktopApi["setExternalLinkPreference"];
  setRemoteNetworkRoute: OpenOwnBotDesktopApi["setRemoteNetworkRoute"];
  setRemoteSessionReusePreference: OpenOwnBotDesktopApi["setRemoteSessionReusePreference"];
  agent: Pick<
    OpenOwnBotDesktopApi["agent"],
    "channelCommand" | "listAgents" | "listChannels" | "listHiddenAgents" | "setAgentHidden" | "updateAgent"
  >;
  dynamicIsland: Pick<
    OpenOwnBotDesktopApi["dynamicIsland"],
    "getBuiltInDisplayGeometry" | "getPreference" | "setPreference"
  >;
  notifications: Pick<
    OpenOwnBotDesktopApi["notifications"],
    "getPreference" | "openSettings" | "setPreference" | "test"
  >;
  maintenance: Pick<OpenOwnBotDesktopApi["maintenance"], "openLogs">;
  update: Pick<OpenOwnBotDesktopApi["update"], "getPreference" | "onPreference" | "setPreference">;
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function settingsPort(): SettingsPort {
  return window.openownbot;
}
