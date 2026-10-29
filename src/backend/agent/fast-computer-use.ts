import type { Effect } from "effect";
import { z } from "zod";
import type { FastRunResult } from "../computer-use-fast";

/**
 * The arguments of `computer_use_fast`. `pid` and `windowId` are the driver's own: the agent reads
 * them from `list_windows`, the same way it addresses every other driver tool.
 */
export const fastComputerUseToolShape = {
  goal: z.string().min(1).max(500).describe("One small step in this window, in plain words. Not a whole task."),
  pid: z.number().int().positive().describe("The `pid` of the window from the driver's list_windows."),
  windowId: z.number().int().positive().describe("The `window_id` of the window from the driver's list_windows."),
  text: z
    .string()
    .max(2000)
    .optional()
    .describe("The exact text to type, when the step needs some. Never a password or a secret."),
};
export const fastComputerUseToolSchema = z.object(fastComputerUseToolShape);
export type FastComputerUseRequest = z.infer<typeof fastComputerUseToolSchema>;

/** Which service decides, as far as the user's approval names it. */
export type FastComputerUseService = "jev" | "openrouter" | "cloudflare" | "local";

/**
 * What the fast path needs from the application: whether a model is chosen and allowed, and a run.
 *
 * A run never fails. A driver that is not running, a model that is slow and every refused action come
 * back as `fallback`, which is the signal for the agent to carry on with the ordinary driver tools.
 */
export interface FastComputerUseHost {
  /** The service that would decide, or null when no model is chosen or the user did not allow it. */
  service(): FastComputerUseService | null;
  run(request: FastComputerUseRequest): Effect.Effect<FastRunResult>;
}
