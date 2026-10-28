import type { OpenBotDesktopApi } from "@openbot/contracts/ipc";

/** What the decision model section reaches in main: its settings and keys. */
export interface DecisionModelPort {
  decisionModel: OpenBotDesktopApi["decisionModel"];
}

/** Read on each call: tests and stories replace `window.openbot` per case. */
export function decisionModelPort(): DecisionModelPort {
  return window.openbot;
}
