import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/**
 * What the usage panel reaches in main: the analytics of a server, its agents, and the events that
 * make the report stale.
 */
export interface UsagePort {
  agent: Pick<OpenOwnBotDesktopApi["agent"], "getHostAnalytics" | "listAgents" | "onScopedEvent">;
  servers: Pick<OpenOwnBotDesktopApi["servers"], "onEvent">;
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function usagePort(): UsagePort {
  return window.openownbot;
}
