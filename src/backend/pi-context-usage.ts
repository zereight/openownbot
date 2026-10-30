import type { DynamicRecord } from "@robot/contracts/runtime-values";
import { isRecord } from "./protocol";

/**
 * The `thread/tokenUsage/updated` params for what `get_session_stats` of Pi says about the context window,
 * or null when it says none. Pi omits `contextUsage` with no model, and reports `tokens: null` until the
 * first answer after a compaction.
 */
export function piTokenUsageParams(stats: unknown): DynamicRecord | null {
  const usage = isRecord(stats) ? stats.contextUsage : undefined;
  if (!isRecord(usage)) return null;
  const { tokens, contextWindow } = usage;
  if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens < 0) return null;
  if (typeof contextWindow !== "number" || !Number.isFinite(contextWindow) || contextWindow <= 0) return null;
  return { tokenUsage: { last: { totalTokens: tokens }, modelContextWindow: contextWindow } };
}
