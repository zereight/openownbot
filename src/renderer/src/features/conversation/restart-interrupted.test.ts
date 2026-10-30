import { type QueueDelivery, RESTART_INTERRUPTED_REASON } from "@robot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { restartInterruptedDelivery } from "./restart-interrupted";

function delivery(id: string, patch: Partial<QueueDelivery> = {}): QueueDelivery {
  return {
    id,
    messageId: `m-${id}`,
    recipientAgentId: "agent-1",
    sender: { kind: "user" },
    text: id,
    attachments: [],
    replyToMessageId: null,
    status: "completed",
    position: null,
    turnId: null,
    error: null,
    createdAt: "2026-10-29T00:00:00.000Z",
    ...patch,
  };
}

const restarted = { status: "interrupted", error: RESTART_INTERRUPTED_REASON } as const;

describe("restartInterruptedDelivery", () => {
  it("finds the last request of the user when a restart cut it off", () => {
    const deliveries = [delivery("a"), delivery("b", restarted)];
    expect(restartInterruptedDelivery(deliveries, "agent-1")?.id).toBe("b");
  });

  it("finds nothing once the user wrote again, whatever came of it", () => {
    const deliveries = [delivery("a", restarted), delivery("b", { status: "queued" })];
    expect(restartInterruptedDelivery(deliveries, "agent-1")).toBeNull();
  });

  it("does not report a stop by the user or another interruption", () => {
    expect(restartInterruptedDelivery([delivery("a", { status: "interrupted" })], "agent-1")).toBeNull();
    expect(
      restartInterruptedDelivery([delivery("a", { status: "interrupted", error: "Turn did not start." })], "agent-1"),
    ).toBeNull();
  });

  it("ignores deliveries of another agent and those that agents or routines sent", () => {
    const deliveries = [
      delivery("a", { ...restarted, recipientAgentId: "agent-2" }),
      delivery("b", { ...restarted, sender: { kind: "agent", agentId: "agent-3" } }),
    ];
    expect(restartInterruptedDelivery(deliveries, "agent-1")).toBeNull();
  });
});
