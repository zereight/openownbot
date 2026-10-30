import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

/** What the Voice tab reaches in main: the dictation models and the dictation settings. */
export interface VoicePort {
  voice: OpenOwnBotDesktopApi["voice"];
}

/** Read on each call: tests and stories replace `window.openownbot` per case. */
export function voicePort(): VoicePort {
  return window.openownbot;
}
