import { createEffect, createRoot, createSignal, flush, onCleanup } from "solid-js";
import { expect, it } from "vitest";
import { createDetachedRoot } from "./detached-root";

it("creates a root from an effect callback without halting the reactive system", () => {
  let created = 0;
  const dispose = createRoot((disposeOwner) => {
    const [trigger] = createSignal(true);
    createEffect(trigger, () => {
      createDetachedRoot(() => {
        created += 1;
      });
    });
    return disposeOwner;
  });

  expect(() => flush()).not.toThrow();
  expect(created).toBe(1);
  dispose();
});

it("outlives the owner that created it until it is disposed", () => {
  let cleanups = 0;
  let disposeDetached: () => void = () => {};
  const disposeOwner = createRoot((dispose) => {
    createDetachedRoot((disposeRoot) => {
      disposeDetached = disposeRoot;
      onCleanup(() => {
        cleanups += 1;
      });
    });
    return dispose;
  });

  disposeOwner();
  expect(cleanups).toBe(0);
  disposeDetached();
  expect(cleanups).toBe(1);
});
