// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCauseEffect } from "../../backend/effect-boundary";
import { createRemoteNetworkRoutePreferenceStore } from "./remote-network-route-preference-store";

async function routeAfterLoading(file: string | null) {
  const root = await mkdtemp(join(tmpdir(), "route-store-test-"));
  try {
    const path = join(root, "route.json");
    if (file !== null) await writeFile(path, file);
    const store = createRemoteNetworkRoutePreferenceStore(path);
    await runCauseEffect(store.load());
    return store.get().route;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("remote network route preference", () => {
  it("reads as private when nothing was saved", async () => {
    expect(await routeAfterLoading(null)).toBe("private");
  });

  it("reads a saved openownbot route as private, because this fork has the relay route switched off", async () => {
    expect(await routeAfterLoading('{"version":1,"route":"openownbot"}')).toBe("private");
  });

  it("keeps a saved private route", async () => {
    expect(await routeAfterLoading('{"version":1,"route":"private"}')).toBe("private");
  });

  it("reads a file that names an unknown route as private", async () => {
    expect(await routeAfterLoading('{"version":1,"route":"carrier-pigeon"}')).toBe("private");
  });
});
