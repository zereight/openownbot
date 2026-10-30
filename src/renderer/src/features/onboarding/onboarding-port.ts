import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/**
 * What onboarding reaches in main: the saved setup.
 */
export interface OnboardingPort {
  getSetupState: OpenOwnBotDesktopApi["getSetupState"];
  saveSetup: OpenOwnBotDesktopApi["saveSetup"];
  onSetupState: OpenOwnBotDesktopApi["onSetupState"];
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function onboardingPort(): OnboardingPort {
  return window.openownbot;
}
