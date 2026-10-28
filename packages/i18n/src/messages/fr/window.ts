import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/window";

export const messages = {
  // Native window titles.
  "window.localHostTitle": "zereight bot – Hôte local",
  "window.localClientTitle": "zereight bot – Client local",
  "window.computerUsePermissionTitle": "Activer Computer Use",
} as const satisfies PartialTranslation<typeof source>;
