import type { ConversationMessage } from "@robot/contracts/ipc";

/**
 * How long before the end of a turn a steered message is too late to have been read. A provider takes a
 * steer without saying whether the model read it, so a steer that lands as the turn ends is lost: the
 * turn finishes with its old answer and nothing starts for the message.
 */
export const UNREAD_STEER_WINDOW_MS = 3000;

/**
 * Whether a message steered into a turn can have been read when the turn ended. It was not when the turn
 * ended within the window after the steer and no answer of the model in that turn is newer than the steer.
 */
export function steerWasUnread(input: {
  steeredAt: string | undefined;
  endedAt: number;
  turnId: string;
  messages: readonly Pick<ConversationMessage, "turnId" | "author" | "createdAt">[];
}): boolean {
  if (input.steeredAt === undefined) return false;
  const steered = Date.parse(input.steeredAt);
  if (!Number.isFinite(steered) || input.endedAt - steered > UNREAD_STEER_WINDOW_MS) return false;
  return !input.messages.some((message) => {
    if (message.turnId !== input.turnId || message.author !== "assistant") return false;
    const created = Date.parse(message.createdAt);
    return Number.isFinite(created) && created > steered;
  });
}
