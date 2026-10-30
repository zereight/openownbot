import { type QueueDelivery, RESTART_INTERRUPTED_REASON } from "@robot/contracts/ipc";

/**
 * The last request of the user to this agent, when a restart of ROBot cut it off and the user has not
 * written since. Any later message of the user ends it: the user went on, or already asked to continue.
 */
export function restartInterruptedDelivery(
  deliveries: readonly QueueDelivery[],
  agentId: string,
): QueueDelivery | null {
  const last = deliveries.findLast(
    (delivery) => delivery.recipientAgentId === agentId && delivery.sender.kind === "user",
  );
  return last?.status === "interrupted" && last.error === RESTART_INTERRUPTED_REASON ? last : null;
}
