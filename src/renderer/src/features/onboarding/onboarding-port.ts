import type { OpenOwnBotDesktopApi } from "@openownbot/contracts/ipc";

/**
 * What onboarding reaches in main: the saved setup, and the preview of an invite before the user
 * joins.
 */
export interface OnboardingPort {
  getSetupState: OpenOwnBotDesktopApi["getSetupState"];
  saveSetup: OpenOwnBotDesktopApi["saveSetup"];
  servers: Pick<OpenOwnBotDesktopApi["servers"], "previewInvite">;
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function onboardingPort(): OnboardingPort {
  return window.openownbot;
}
