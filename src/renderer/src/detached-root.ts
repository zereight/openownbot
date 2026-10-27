import { createRoot, getOwner, runWithOwner } from "solid-js";

// The owner every detached root hangs from, and nothing ever disposes it.
const detachedOwner = createRoot(() => getOwner());

/**
 * A reactive root that outlives whatever creates it, for UI the caller hands to a notification.
 *
 * A bare `createRoot` inside an owner is disposed with that owner, so a notification built from an
 * effect would vanish on the next run of that effect. `runWithOwner(null, ...)` detaches it, but the
 * apply half of an effect runs with no owner, and development Solid refuses a root created there
 * without one (`PRIMITIVE_IN_EFFECT_CALLBACK`). That halts the reactive system for the whole page,
 * which left the app on its splash screen. A root under a long-lived owner is allowed everywhere,
 * and the caller still ends it with the `dispose` it is given.
 */
export function createDetachedRoot<T>(init: (dispose: () => void) => T): T {
  return runWithOwner(detachedOwner, () => createRoot(init));
}
