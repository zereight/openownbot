import { describe, expect, it } from "vitest";
import { driftedFromLatest, OPEN_SETTLE_MS } from "./scroll-follow";

const drift = { following: true, moved: -40, fromReader: false, sinceOpenMs: 500 };

describe("driftedFromLatest", () => {
  it("pulls a chat back that moved up by itself just after it opened", () => {
    expect(driftedFromLatest(drift)).toBe(true);
  });

  it("leaves the reader alone, who scrolled up by wheel, touch, drag or key", () => {
    expect(driftedFromLatest({ ...drift, fromReader: true })).toBe(false);
  });

  it("does nothing for a chat that does not follow the latest message", () => {
    expect(driftedFromLatest({ ...drift, following: false })).toBe(false);
  });

  it("ignores a scroll down and a scroll that did not move", () => {
    expect(driftedFromLatest({ ...drift, moved: 30 })).toBe(false);
    expect(driftedFromLatest({ ...drift, moved: 0 })).toBe(false);
  });

  it("stops once the chat has settled, so a later correction of a row is not fought", () => {
    expect(driftedFromLatest({ ...drift, sinceOpenMs: OPEN_SETTLE_MS })).toBe(false);
  });
});
