import type { ProviderUpdate } from "@robot/ui/features/provider-updates/provider-update";
import { createEffect, createRoot, createSignal, flush } from "solid-js";
import { afterEach, expect, it } from "vitest";
import { hideProviderUpdateToast, showProviderUpdateToast } from "./provider-update-toast";

const OFFER: ProviderUpdate = {
  provider: "codex",
  name: "ChatGPT",
  runtime: { phase: "ready", progress: null, message: null, version: "1.0.0", availableVersion: "1.1.0" },
  availableVersion: "1.1.0",
};

afterEach(() => hideProviderUpdateToast("codex"));

// The runtime store raises an offer from the apply half of an effect, where development Solid
// refuses to create a root that has no owner. That halted the reactive system for the whole page.
it("raises an offer from an effect callback without halting the reactive system", () => {
  let raised = 0;
  const dispose = createRoot((disposeRoot) => {
    const [offer] = createSignal(OFFER);
    createEffect(offer, (next) => {
      showProviderUpdateToast(next, () => {});
      raised += 1;
    });
    return disposeRoot;
  });

  expect(() => flush()).not.toThrow();
  expect(raised).toBe(1);
  dispose();
});
