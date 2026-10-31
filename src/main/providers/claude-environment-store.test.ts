import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { ClaudeEnvironmentStore } from "./claude-environment-store";

const cipher = {
  canPersist: () => true,
  encrypt: (value: string) => Buffer.from(`enc:${value}`),
  decrypt: (value: Buffer) => value.toString().replace(/^enc:/, ""),
};

async function open(file?: string) {
  const path = join(await mkdtemp(join(tmpdir(), "claude-env-")), "env.json");
  if (file) await writeFile(path, file);
  const store = new ClaudeEnvironmentStore({ path, cipher });
  await Effect.runPromise(store.load());
  return { store, path };
}

describe("ClaudeEnvironmentStore", () => {
  it("shows a plain value and hides a secret, yet passes both to Claude", async () => {
    const { store } = await open();
    await Effect.runPromise(
      store.set([
        { name: "MODE", secret: false, value: "fast" },
        { name: "TOKEN", secret: true, value: "s3cret" },
      ]),
    );
    expect(store.view().entries).toEqual([
      { name: "MODE", secret: false, value: "fast" },
      { name: "TOKEN", secret: true, value: null },
    ]);
    expect(store.values()).toEqual({ MODE: "fast", TOKEN: "s3cret" });
  });

  it("keeps a secret out of the file in plain text, and reads it back after a restart", async () => {
    const { store, path } = await open();
    await Effect.runPromise(store.set([{ name: "TOKEN", secret: true, value: "s3cret" }]));
    const text = await readFile(path, "utf8");
    expect(text).not.toContain("s3cret");
    const again = new ClaudeEnvironmentStore({ path, cipher });
    await Effect.runPromise(again.load());
    expect(again.values()).toEqual({ TOKEN: "s3cret" });
    expect(again.view().entries[0]).toEqual({ name: "TOKEN", secret: true, value: null });
  });

  it("keeps the saved secret for a row saved with a null value, and replaces it for a new value", async () => {
    const { store } = await open();
    await Effect.runPromise(store.set([{ name: "TOKEN", secret: true, value: "one" }]));
    await Effect.runPromise(store.set([{ name: "TOKEN", secret: true, value: null }]));
    expect(store.values()).toEqual({ TOKEN: "one" });
    await Effect.runPromise(store.set([{ name: "TOKEN", secret: true, value: "two" }]));
    expect(store.values()).toEqual({ TOKEN: "two" });
  });

  it("refuses a row that is wrong and changes nothing", async () => {
    const { store } = await open();
    await Effect.runPromise(store.set([{ name: "A", secret: false, value: "1" }]));
    const refused = await Effect.runPromise(Effect.flip(store.set([{ name: "PATH", secret: false, value: "/x" }])));
    expect(String(refused.cause)).toMatch(/Row 1/);
    expect(store.values()).toEqual({ A: "1" });
  });

  it("refuses a secret when the keychain cannot keep it", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "claude-env-")), "env.json");
    const store = new ClaudeEnvironmentStore({ path, cipher: { ...cipher, canPersist: () => false } });
    await Effect.runPromise(Effect.flip(store.set([{ name: "T", secret: true, value: "x" }])));
    await Effect.runPromise(store.set([{ name: "A", secret: false, value: "1" }]));
    expect(store.values()).toEqual({ A: "1" });
  });

  it("reads the file of the first build as variables that are not secrets, and drops a refused name", async () => {
    const { store } = await open(JSON.stringify({ version: 1, environment: { A: "1", PATH: "/x" } }));
    expect(store.view().entries).toEqual([{ name: "A", secret: false, value: "1" }]);
  });

  it("leaves out a secret that cannot be opened, and keeps its name", async () => {
    const { store, path } = await open();
    await Effect.runPromise(
      store.set([
        { name: "T", secret: true, value: "x" },
        { name: "A", secret: false, value: "1" },
      ]),
    );
    const broken = new ClaudeEnvironmentStore({
      path,
      cipher: {
        ...cipher,
        decrypt: () => {
          throw new Error("no keychain");
        },
      },
    });
    await Effect.runPromise(broken.load());
    expect(broken.values()).toEqual({ A: "1" });
    expect(broken.view().entries.map((e) => e.name)).toEqual(["T", "A"]);
  });
});
