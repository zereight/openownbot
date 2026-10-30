import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/**
 * What provider state reaches in main: connecting, signing in and refreshing providers, and the
 * runtimes OpenOwnBot installs for them, on this computer or on a host the account administers.
 */
export interface ProvidersPort {
  cancelProviderCodeLogin: OpenOwnBotDesktopApi["cancelProviderCodeLogin"];
  connectProvider: OpenOwnBotDesktopApi["connectProvider"];
  cancelProviderSignIn: OpenOwnBotDesktopApi["cancelProviderSignIn"];
  refreshAgentProviders: OpenOwnBotDesktopApi["refreshAgentProviders"];
  setProviderOn: OpenOwnBotDesktopApi["setProviderOn"];
  restartProvider: OpenOwnBotDesktopApi["restartProvider"];
  cancelProviderRestart: OpenOwnBotDesktopApi["cancelProviderRestart"];
  startProviderCodeLogin: OpenOwnBotDesktopApi["startProviderCodeLogin"];
  providerRuntimes: OpenOwnBotDesktopApi["providerRuntimes"];
  connectProviderAccount: OpenOwnBotDesktopApi["connectProviderAccount"];
  cancelProviderAccountSignIn: OpenOwnBotDesktopApi["cancelProviderAccountSignIn"];
  renameProviderAccount: OpenOwnBotDesktopApi["renameProviderAccount"];
  removeProviderAccount: OpenOwnBotDesktopApi["removeProviderAccount"];
  providerUsageResets: OpenOwnBotDesktopApi["providerUsageResets"];
  resetProviderUsage: OpenOwnBotDesktopApi["resetProviderUsage"];
  /** The same, for the host of a joined server the account administers. */
  providerAdmin: OpenOwnBotDesktopApi["providerAdmin"];
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function providersPort(): ProvidersPort {
  return window.openownbot;
}
