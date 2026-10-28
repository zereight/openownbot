import { describe, expect, it } from "vitest";
import { piTokenUsageParams } from "./pi-context-usage";

describe("piTokenUsageParams", () => {
  it("reports the context window usage that Pi read from its session", () => {
    expect(
      piTokenUsageParams({ tokens: { input: 1 }, contextUsage: { tokens: 60000, contextWindow: 200000, percent: 30 } }),
    ).toEqual({ tokenUsage: { last: { totalTokens: 60000 }, modelContextWindow: 200000 } });
  });

  it("reports nothing right after a compaction, when Pi has no count yet", () => {
    expect(piTokenUsageParams({ contextUsage: { tokens: null, contextWindow: 200000, percent: null } })).toBeNull();
  });

  it("reports nothing when Pi omits the usage or the window is unknown", () => {
    expect(piTokenUsageParams({ tokens: {} })).toBeNull();
    expect(piTokenUsageParams({ contextUsage: { tokens: 10, contextWindow: 0 } })).toBeNull();
    expect(piTokenUsageParams(null)).toBeNull();
  });
});
