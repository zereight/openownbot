import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/** What the decision model section reaches in main: its settings and keys. */
export interface DecisionModelPort {
  decisionModel: OpenOwnBotDesktopApi["decisionModel"];
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function decisionModelPort(): DecisionModelPort {
  return window.openownbot;
}
