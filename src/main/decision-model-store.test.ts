// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { DecisionModelStore } from "./decision-model-store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const cipher = (persist = true) => ({
  canPersist: () => persist,
  encrypt: (value: string) => Buffer.from(`sealed:${value}`.split("").reverse().join("")),
  decrypt: (value: Buffer) =>
    value
      .toString()
      .split("")
      .reverse()
      .join("")
      .replace(/^sealed:/, ""),
});

async function open(root: string, persist = true) {
  const store = new DecisionModelStore({
    settingsPath: join(root, "decision-model.json"),
    keysPath: join(root, "decision-model-keys.json"),
    cipher: cipher(persist),
  });
  await Effect.runPromise(store.load());
  return store;
}

async function setup(persist = true) {
  const root = await mkdtemp(join(tmpdir(), "decision-model-test-"));
  roots.push(root);
  return { root, store: await open(root, persist) };
}

/** The settings of the state, without the keys: what the settings form sends. */
function settingsOf(store: DecisionModelStore) {
  const { backend, openrouterModel, cloudflareAccountId, cloudflareModel } = store.state();
  return { backend, openrouterModel, cloudflareAccountId, cloudflareModel };
}

const account = "0123456789abcdef0123456789abcdef";

describe("DecisionModelStore", () => {
  it("starts off, with no key saved, and picks no backend", async () => {
    const { store } = await setup();
    expect(store.state()).toMatchObject({ backend: "off", keys: { jev: false, openrouter: false, cloudflare: false } });
    expect(store.resolve()).toBeNull();
  });

  it("saves the settings and a key, and tells the renderer only that the key is saved", async () => {
    const { store } = await setup();
    const state = await Effect.runPromise(
      store.save({ ...settingsOf(store), backend: "jev", keys: { jev: "secret-jev-key" } }),
    );
    expect(state.backend).toBe("jev");
    expect(state.keys).toEqual({ jev: true, openrouter: false, cloudflare: false });
    expect(JSON.stringify(state)).not.toContain("secret-jev-key");
    expect(store.resolve()).toEqual({ kind: "jev", apiKey: "secret-jev-key" });
  });

  it("keeps a key that the input does not name, and removes one that is null", async () => {
    const { store } = await setup();
    await Effect.runPromise(
      store.save({ ...settingsOf(store), backend: "jev", keys: { jev: "k1", openrouter: "k2" } }),
    );
    await Effect.runPromise(store.save({ ...settingsOf(store), backend: "jev" }));
    expect(store.state().keys).toMatchObject({ jev: true, openrouter: true });
    await Effect.runPromise(store.save({ ...settingsOf(store), backend: "jev", keys: { jev: null } }));
    expect(store.state().keys).toMatchObject({ jev: false, openrouter: true });
    expect(store.resolve()).toBeNull();
  });

  it("never writes a key as plain text, and reads it back after a restart", async () => {
    const { root, store } = await setup();
    await Effect.runPromise(
      store.save({ ...settingsOf(store), backend: "openrouter", keys: { openrouter: "sk-or-plain-text" } }),
    );
    expect(await readFile(join(root, "decision-model-keys.json"), "utf8")).not.toContain("sk-or-plain-text");
    expect(await readFile(join(root, "decision-model.json"), "utf8")).not.toContain("sk-or-plain-text");
    const reopened = await open(root);
    expect(reopened.resolve()).toEqual({ kind: "openrouter", apiKey: "sk-or-plain-text", model: "typesafe/jev-1.14" });
  });

  it("picks Cloudflare only with an account, a token and a model", async () => {
    const { store } = await setup();
    await Effect.runPromise(
      store.save({
        ...settingsOf(store),
        backend: "cloudflare",
        cloudflareModel: "clef",
        keys: { cloudflare: "cf-token" },
      }),
    );
    expect(store.resolve()).toBeNull();
    await Effect.runPromise(store.save({ ...settingsOf(store), backend: "cloudflare", cloudflareAccountId: account }));
    expect(store.resolve()).toEqual({ kind: "cloudflare", accountId: account, apiToken: "cf-token", model: "clef" });
  });

  it("picks nothing when the chosen backend has no key, even if another has one", async () => {
    const { store } = await setup();
    await Effect.runPromise(store.save({ ...settingsOf(store), backend: "jev", keys: { openrouter: "k" } }));
    expect(store.resolve()).toBeNull();
  });

  it("refuses to save a key where the system cannot encrypt it, and saves nothing", async () => {
    const { store } = await setup(false);
    const outcome = await Effect.runPromise(
      Effect.result(store.save({ ...settingsOf(store), backend: "jev", keys: { jev: "k" } })),
    );
    expect(outcome._tag).toBe("Failure");
    expect(store.state().backend).toBe("off");
    expect(store.state().keys.jev).toBe(false);
  });

  it("reads a key that this computer cannot decrypt as no key", async () => {
    const { root, store } = await setup();
    await Effect.runPromise(store.save({ ...settingsOf(store), backend: "jev", keys: { jev: "k" } }));
    const broken = new DecisionModelStore({
      settingsPath: join(root, "decision-model.json"),
      keysPath: join(root, "decision-model-keys.json"),
      cipher: {
        canPersist: () => true,
        encrypt: () => Buffer.alloc(0),
        decrypt: () => {
          throw new Error("keychain changed");
        },
      },
    });
    await Effect.runPromise(broken.load());
    expect(broken.state().keys.jev).toBe(false);
    expect(broken.resolve()).toBeNull();
  });
});
