import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { type AgentSquad, isAgentSquad, type SaveSquadInput, SQUAD_LIMITS } from "@openbot/contracts/squads";
import { Effect, Result, Semaphore } from "effect";
import { parseStoredJson, writeJsonFileAtomically } from "./atomic-json-file";
import { isMissingFileError } from "./file-errors";
import { StoredStateFailure, storedIO, storedSync } from "./stored-state-effects";

interface StoredSquads {
  version: 1;
  squads: AgentSquad[];
}

interface SquadStoreEvents {
  changed: [squads: AgentSquad[]];
}

function decodeStored(value: unknown): StoredSquads {
  if (!isDynamicRecord(value) || value.version !== 1 || !Array.isArray(value.squads))
    throw new Error("Invalid squad state.");
  // A file from before ranks existed has none, which reads as a squad with no ranks.
  const squads = value.squads.map((squad) =>
    isDynamicRecord(squad) ? { ranks: [], memberRanks: {}, ...squad } : squad,
  );
  if (!squads.every(isAgentSquad)) throw new Error("Invalid squad state.");
  return { version: 1, squads: squads.map((squad) => structuredClone(squad)) };
}

/**
 * The squads the user made. Only the user's own screen writes here: an agent has no tool that
 * reaches this store, so an agent cannot join, leave or lead a squad by itself.
 */
export class SquadStore extends EventEmitter<SquadStoreEvents> {
  readonly #path: string;
  #squads: AgentSquad[] = [];
  readonly #queue = Semaphore.makeUnsafe(1);

  constructor(path: string) {
    super();
    this.#path = path;
  }

  initialize(): Effect.Effect<void, StoredStateFailure> {
    return Effect.gen({ self: this }, function* () {
      yield* storedIO(() => mkdir(dirname(this.#path), { recursive: true, mode: 0o700 }));
      const loaded = yield* Effect.result(
        Effect.gen({ self: this }, function* () {
          const contents = yield* storedIO(() => readFile(this.#path, "utf8"));
          return yield* storedSync(() => parseStoredJson(this.#path, contents, decodeStored));
        }),
      );
      if (Result.isSuccess(loaded)) {
        this.#squads = loaded.success.squads;
        return;
      }
      if (isMissingFileError(loaded.failure.cause)) return;
      yield* storedIO(() => rename(this.#path, `${this.#path}.corrupt-${Date.now()}`)).pipe(
        Effect.catch(() => Effect.void),
      );
      this.#squads = [];
    });
  }

  list(): AgentSquad[] {
    return structuredClone(this.#squads);
  }

  /**
   * Creates a squad, or replaces the one with `input.id`. `agentIds` are the agents that exist: a
   * squad names none besides them, and a lead is not also listed as a member.
   */
  save(input: SaveSquadInput, agentIds: ReadonlySet<string>): Effect.Effect<AgentSquad, StoredStateFailure> {
    return this.#enqueue(
      Effect.gen({ self: this }, function* () {
        const squad = yield* storedSync(() => {
          const name = input.name.trim();
          const members = [...new Set(input.memberAgentIds)];
          const candidate: AgentSquad = {
            id: input.id ?? randomUUID(),
            name,
            leadAgentId: input.leadAgentId,
            memberAgentIds: members,
            ranks: input.ranks.map((rank) => rank.trim()),
            memberRanks: Object.fromEntries(Object.entries(input.memberRanks).filter(([id]) => members.includes(id))),
          };
          if (!isAgentSquad(candidate)) throw new Error("The squad is not valid.");
          if (![candidate.leadAgentId, ...members].every((id) => agentIds.has(id)))
            throw new Error("A squad can only name agents that exist.");
          if (input.id !== undefined && !this.#squads.some((item) => item.id === input.id))
            throw new Error("The squad does not exist.");
          if (this.#squads.some((item) => item.id !== candidate.id && item.name.toLowerCase() === name.toLowerCase()))
            throw new Error("Squad names must be unique.");
          if (input.id === undefined && this.#squads.length >= SQUAD_LIMITS.squads)
            throw new Error("There are too many squads.");
          return candidate;
        });
        const next = this.#squads.some((item) => item.id === squad.id)
          ? this.#squads.map((item) => (item.id === squad.id ? squad : item))
          : [...this.#squads, squad];
        yield* this.#commit(next);
        return structuredClone(squad);
      }),
    );
  }

  remove(squadId: string): Effect.Effect<void, StoredStateFailure> {
    return this.#enqueue(this.#commit(this.#squads.filter((squad) => squad.id !== squadId)));
  }

  /**
   * Drops the agents that no longer exist. A squad whose lead is gone is removed: promoting a member
   * would hand the lead's reach to an agent the user did not choose.
   */
  reconcile(agentIds: ReadonlySet<string>): Effect.Effect<void, StoredStateFailure> {
    return this.#enqueue(
      Effect.gen({ self: this }, function* () {
        const next = this.#squads
          .filter((squad) => agentIds.has(squad.leadAgentId))
          .map((squad) => {
            const members = squad.memberAgentIds.filter((id) => agentIds.has(id));
            return {
              ...squad,
              memberAgentIds: members,
              memberRanks: Object.fromEntries(Object.entries(squad.memberRanks).filter(([id]) => members.includes(id))),
            };
          });
        if (JSON.stringify(next) !== JSON.stringify(this.#squads)) yield* this.#commit(next);
      }),
    );
  }

  #commit(next: AgentSquad[]): Effect.Effect<void, StoredStateFailure> {
    return Effect.gen({ self: this }, function* () {
      const stored: StoredSquads = { version: 1, squads: next };
      yield* writeJsonFileAtomically(this.#path, stored).pipe(
        Effect.mapError(({ cause }) => new StoredStateFailure({ cause })),
      );
      this.#squads = next;
      this.emit("changed", this.list());
    });
  }

  #enqueue<A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> {
    return this.#queue.withPermit(effect.pipe(Effect.uninterruptible));
  }
}
