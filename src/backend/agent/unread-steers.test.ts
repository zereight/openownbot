import { describe, expect, it } from "vitest";
import { steerWasUnread, UNREAD_STEER_WINDOW_MS } from "./unread-steers";

const steeredAt = "2026-10-27T16:50:44.120Z";
const at = (offsetMs: number) => new Date(Date.parse(steeredAt) + offsetMs).toISOString();

describe("steerWasUnread", () => {
  it("is unread when the turn ended right after the steer with no newer answer", () => {
    expect(
      steerWasUnread({
        steeredAt,
        endedAt: Date.parse(at(230)),
        turnId: "turn-1",
        messages: [{ turnId: "turn-1", author: "assistant", createdAt: at(-14000) }],
      }),
    ).toBe(true);
  });

  it("is read when the agent wrote something after the steer", () => {
    expect(
      steerWasUnread({
        steeredAt,
        endedAt: Date.parse(at(900)),
        turnId: "turn-1",
        messages: [{ turnId: "turn-1", author: "assistant", createdAt: at(600) }],
      }),
    ).toBe(false);
  });

  it("ignores a newer message of another turn or of another agent", () => {
    expect(
      steerWasUnread({
        steeredAt,
        endedAt: Date.parse(at(200)),
        turnId: "turn-1",
        messages: [
          { turnId: "turn-2", author: "assistant", createdAt: at(100) },
          { turnId: "turn-1", author: "agent", createdAt: at(100) },
        ],
      }),
    ).toBe(true);
  });

  it("is read when the turn went on long after the steer", () => {
    expect(
      steerWasUnread({
        steeredAt,
        endedAt: Date.parse(at(UNREAD_STEER_WINDOW_MS + 1)),
        turnId: "turn-1",
        messages: [],
      }),
    ).toBe(false);
  });

  it("is read for a delivery that was never steered", () => {
    expect(steerWasUnread({ steeredAt: undefined, endedAt: Date.parse(at(10)), turnId: "turn-1", messages: [] })).toBe(
      false,
    );
  });
});
