import type { ConversationMessage } from "@robot/contracts/ipc";
import { isConversationMessage, isConversationTurnTrace } from "@robot/contracts/ipc";
import { isDynamicRecord } from "@robot/contracts/runtime-values";

/** A stored conversation message, or `null` when the value is not one. */
export function storedConversationMessage(value: unknown): ConversationMessage | null {
  if (isConversationMessage(value)) return value;
  // The trace is timing data that a later build can write in another shape. A trace that does not
  // decode is dropped, so the message still reads.
  if (!isDynamicRecord(value) || value.trace === undefined || isConversationTurnTrace(value.trace)) return null;
  const { trace: _dropped, ...message } = value;
  return isConversationMessage(message) ? message : null;
}
