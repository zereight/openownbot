/**
 * Who started a turn, from the deliveries that the turn reads. Pure: the mailbox and the host supply
 * the lookups. The webhook routine tools and the workflow tools share the person rule, so a routine
 * run, an agent message, a message that an agent's tool call wrote, a channel task and a Slack or
 * Telegram message cannot reach either.
 */

import type { ConversationMessageSender, QueueDelivery } from "@robot/contracts/ipc";

/** What a requester rule reads of a delivery: who sent the message, and which message it is. */
export type TurnDelivery = Pick<QueueDelivery, "sender" | "messageId">;

/**
 * A person on this computer, a team member whose client has only what the Team API gives it, or no
 * person at all: a routine, an agent or a channel.
 */
export type TurnRequester = { kind: "host-person" } | { kind: "member"; personId: string } | { kind: "none" };

/**
 * Whether a person's messages started the turn, in the agent's own chat: every delivery of the turn is
 * from `user` (a message steered into a routine run shares the run's turn) and no agent's tool call
 * wrote it (`create_agent` writes the first message of a new agent as `user`), and the thread is not an
 * execution thread (a channel task, an agent task, a Slack or Telegram conversation also arrive as `user`).
 */
export function personTurn(
  deliveries: readonly TurnDelivery[],
  inExecutionThread: boolean,
  writtenByAgentId: (messageId: string) => string | undefined,
): boolean {
  return (
    deliveries.length > 0 &&
    deliveries.every(
      (delivery) => delivery.sender.kind === "user" && writtenByAgentId(delivery.messageId) === undefined,
    ) &&
    !inExecutionThread
  );
}

/**
 * The requester of a turn. The host stamps the person on each user message (`senderMember`); a
 * message with no stamp is this computer's, sent while signed out. A stamped person who is remote
 * makes the turn a member's.
 */
export function turnRequester(input: {
  deliveries: readonly TurnDelivery[];
  inExecutionThread: boolean;
  senderMember: (messageId: string) => ConversationMessageSender | undefined;
  writtenByAgentId: (messageId: string) => string | undefined;
  remotePerson: (personId: string) => boolean;
}): TurnRequester {
  if (!personTurn(input.deliveries, input.inExecutionThread, input.writtenByAgentId)) return { kind: "none" };
  for (const delivery of input.deliveries) {
    const member = input.senderMember(delivery.messageId);
    if (member && input.remotePerson(member.id)) return { kind: "member", personId: member.id };
  }
  return { kind: "host-person" };
}
