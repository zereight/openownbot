import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SquadStore } from "./squad-store";

let directory = "";
const agents = new Set(["lead", "a", "b", "c"]);

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "squads-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const open = async () => {
  const store = new SquadStore(join(directory, "squads.json"));
  await Effect.runPromise(store.initialize());
  return store;
};

describe("SquadStore", () => {
  it("creates a squad and keeps it after a restart", async () => {
    const store = await open();
    const squad = await Effect.runPromise(
      store.save({ name: " Review ", leadAgentId: "lead", memberAgentIds: ["a", "b"] }, agents),
    );
    expect(squad).toMatchObject({ name: "Review", leadAgentId: "lead", memberAgentIds: ["a", "b"] });
    const again = await open();
    expect(again.list()).toEqual([squad]);
  });

  it("changes a squad by its id", async () => {
    const store = await open();
    const squad = await Effect.runPromise(
      store.save({ name: "Review", leadAgentId: "lead", memberAgentIds: [] }, agents),
    );
    const changed = await Effect.runPromise(
      store.save({ id: squad.id, name: "Review 2", leadAgentId: "a", memberAgentIds: ["lead"] }, agents),
    );
    expect(changed).toMatchObject({ id: squad.id, name: "Review 2", leadAgentId: "a", memberAgentIds: ["lead"] });
    expect(store.list()).toHaveLength(1);
  });

  it("refuses an unknown agent, a lead who is also a member, and a repeated name", async () => {
    const store = await open();
    await expect(
      Effect.runPromise(store.save({ name: "X", leadAgentId: "ghost", memberAgentIds: [] }, agents)),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(store.save({ name: "X", leadAgentId: "lead", memberAgentIds: ["lead"] }, agents)),
    ).rejects.toThrow();
    await Effect.runPromise(store.save({ name: "Review", leadAgentId: "lead", memberAgentIds: [] }, agents));
    await expect(
      Effect.runPromise(store.save({ name: "review", leadAgentId: "a", memberAgentIds: [] }, agents)),
    ).rejects.toThrow();
  });

  it("removes a squad", async () => {
    const store = await open();
    const squad = await Effect.runPromise(
      store.save({ name: "Review", leadAgentId: "lead", memberAgentIds: [] }, agents),
    );
    await Effect.runPromise(store.remove(squad.id));
    expect(store.list()).toEqual([]);
  });

  it("drops a deleted member, and the whole squad when its lead is deleted", async () => {
    const store = await open();
    await Effect.runPromise(store.save({ name: "Review", leadAgentId: "lead", memberAgentIds: ["a", "b"] }, agents));
    await Effect.runPromise(store.save({ name: "Ops", leadAgentId: "c", memberAgentIds: ["a"] }, agents));
    await Effect.runPromise(store.reconcile(new Set(["lead", "b", "c"])));
    expect(store.list().map((squad) => [squad.name, squad.memberAgentIds])).toEqual([
      ["Review", ["b"]],
      ["Ops", []],
    ]);
    await Effect.runPromise(store.reconcile(new Set(["b", "c"])));
    expect(store.list().map((squad) => squad.name)).toEqual(["Ops"]);
  });

  it("starts empty from a file it cannot read and keeps the bad file aside", async () => {
    await writeFile(join(directory, "squads.json"), "{not json");
    const store = await open();
    expect(store.list()).toEqual([]);
    const saved = await readFile(join(directory, "squads.json"), "utf8").catch(() => null);
    expect(saved).toBeNull();
  });
});
