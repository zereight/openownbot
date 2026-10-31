// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRendererRecovery } from "./renderer-recovery";

// Failure modes: a crashed window stays black; a clean exit is reloaded; a page that crashes while
// it loads reloads without end; the count never lets a later crash reload again.
describe("renderer recovery", () => {
  it("reloads after a crash and after running out of memory", () => {
    const recovery = createRendererRecovery(() => 0);
    expect(recovery.shouldReload("crashed")).toBe(true);
    expect(recovery.shouldReload("oom")).toBe(true);
  });

  it("does not reload a clean exit", () => {
    expect(createRendererRecovery(() => 0).shouldReload("clean-exit")).toBe(false);
  });

  it("stops after three reloads in a minute", () => {
    const recovery = createRendererRecovery(() => 1_000);
    expect([1, 2, 3, 4].map(() => recovery.shouldReload("crashed"))).toEqual([true, true, true, false]);
  });

  it("reloads again once a minute has passed", () => {
    let time = 0;
    const recovery = createRendererRecovery(() => time);
    for (let index = 0; index < 3; index += 1) recovery.shouldReload("crashed");
    expect(recovery.shouldReload("crashed")).toBe(false);
    time = 60_001;
    expect(recovery.shouldReload("crashed")).toBe(true);
  });
});
