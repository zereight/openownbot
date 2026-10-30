import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/**
 * What the app shell and the cross-domain root modules reach in main, plus the shell actions
 * (`openUrl`, `openExternal`) that several domains share.
 */
export interface AppPort {
  getAppInfo: OpenOwnBotDesktopApi["getAppInfo"];
  getAppAppearancePreference: OpenOwnBotDesktopApi["getAppAppearancePreference"];
  getAppInterfaceSizePreference: OpenOwnBotDesktopApi["getAppInterfaceSizePreference"];
  getAppLanguagePreference: OpenOwnBotDesktopApi["getAppLanguagePreference"];
  getAppLogoColorPreference: OpenOwnBotDesktopApi["getAppLogoColorPreference"];
  onAppAppearancePreference: OpenOwnBotDesktopApi["onAppAppearancePreference"];
  onAppInterfaceSizePreference: OpenOwnBotDesktopApi["onAppInterfaceSizePreference"];
  onAppLanguagePreference: OpenOwnBotDesktopApi["onAppLanguagePreference"];
  onAppLogoColorPreference: OpenOwnBotDesktopApi["onAppLogoColorPreference"];
  openExternal: OpenOwnBotDesktopApi["openExternal"];
  openUrl: OpenOwnBotDesktopApi["openUrl"];
  openChatWindow: OpenOwnBotDesktopApi["openChatWindow"];
  getChatWindows: OpenOwnBotDesktopApi["getChatWindows"];
  onChatWindows: OpenOwnBotDesktopApi["onChatWindows"];
  setAppAppearancePreference: OpenOwnBotDesktopApi["setAppAppearancePreference"];
  setAppInterfaceSizePreference: OpenOwnBotDesktopApi["setAppInterfaceSizePreference"];
  setAppLanguagePreference: OpenOwnBotDesktopApi["setAppLanguagePreference"];
  setAppLogoColorPreference: OpenOwnBotDesktopApi["setAppLogoColorPreference"];
  agent: Pick<
    OpenOwnBotDesktopApi["agent"],
    "readConversationPage" | "searchConversationMessages" | "searchConversationFiles" | "listRoutines" | "listAgents"
  >;
  agentTemplates: Pick<OpenOwnBotDesktopApi["agentTemplates"], "onOpenLink" | "takePendingLink">;
  acpRegistry: OpenOwnBotDesktopApi["acpRegistry"];
  hostedSites: OpenOwnBotDesktopApi["hostedSites"];
  billing: OpenOwnBotDesktopApi["billing"];
  license: OpenOwnBotDesktopApi["license"];
  hostedServers: OpenOwnBotDesktopApi["hostedServers"];
  routineFeed: OpenOwnBotDesktopApi["routineFeed"];
  events: OpenOwnBotDesktopApi["events"];
  plugins: Pick<OpenOwnBotDesktopApi["plugins"], "onOpenListing" | "takePendingListing">;
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function appPort(): AppPort {
  return window.openownbot;
}
