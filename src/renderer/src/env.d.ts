/// <reference types="vite/client" />

import type { OpenOwnBotDesktopApi } from "@robot/contracts/ipc";

declare global {
  interface HighlightRegistry {
    set(name: string, highlight: Highlight): this;
    delete(name: string): boolean;
  }

  interface Window {
    openownbot: OpenOwnBotDesktopApi;
  }
}
