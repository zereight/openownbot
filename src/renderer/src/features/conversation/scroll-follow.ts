/** How long after a chat opens that a scroll up with no input of the reader counts as a drift. */
export const OPEN_SETTLE_MS = 3000;

/**
 * Whether the chat moved up by itself after it opened while it should stay at the latest message. Rows
 * that are measured late, and images, change the layout with no resize of the list to follow, so the
 * chat can end above the bottom with the button to the latest message showing. A scroll with input of
 * the reader is never a drift.
 */
export function driftedFromLatest(input: {
  following: boolean;
  moved: number;
  fromReader: boolean;
  sinceOpenMs: number;
}): boolean {
  return input.following && input.moved < 0 && !input.fromReader && input.sinceOpenMs < OPEN_SETTLE_MS;
}
