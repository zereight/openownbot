// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentStore } from "./agent-store";
import { runCauseEffect } from "./effect-boundary";
import { OpenBotDatabase } from "./openbot-database";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createStore(): Promise<AgentStore> {
  const userData = await mkdtemp(join(tmpdir(), "openbot-userdata-"));
  const home = await mkdtemp(join(tmpdir(), "openbot-home-"));
  roots.push(userData, home);
  const database = new OpenBotDatabase(userData);
  await runCauseEffect(database.initialize());
  const store = new AgentStore(userData, home, database);
  await runCauseEffect(store.initialize());
  return store;
}

describe("AgentStore.duplicateAgent", () => {
  it("carries the browser session over to the duplicate", async () => {
    const store = await createStore();
    const source = await runCauseEffect(
      store.createAgent({ name: "Source", description: "", avatarSeed: "seed", avatarHue: 215 }),
    );
    const profileId = "0123456789abcdef0123456789abcdef";
    await runCauseEffect(store.updateAgent({ agentId: source.id, browserProfileId: profileId }));

    const duplicate = await runCauseEffect(store.duplicateAgent(source.id));

    expect(duplicate.browserProfileId).toBe(profileId);
  });

  it("carries the agent-only browser session flag over to the duplicate", async () => {
    const store = await createStore();
    const source = await runCauseEffect(
      store.createAgent({ name: "Source", description: "", avatarSeed: "seed", avatarHue: 215 }),
    );
    await runCauseEffect(store.updateAgent({ agentId: source.id, ownBrowserSession: true }));

    const duplicate = await runCauseEffect(store.duplicateAgent(source.id));

    expect(duplicate.ownBrowserSession).toBe(true);
  });
});
