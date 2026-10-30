import {
  type ProviderEnvironment,
  type ProviderEnvironmentInput,
  type ProviderEnvironmentState,
  providerEnvironmentInputIssue,
  readProviderEnvironment,
} from "@robot/contracts/provider-environment";
import { isDynamicRecord } from "@robot/contracts/runtime-values";
import { sourceText } from "@robot/i18n/source";
import { registerSecretValue } from "@robot/logging";
import { Effect, Result, Schema, Semaphore } from "effect";
import { isMissingFileError } from "../backend/file-errors";
import type { CustomProviderCipher } from "./custom-provider-store";
import { type PreferenceFileFailure, readPreferenceFile, writePreferenceFile } from "./preference-file";

/** A list that cannot be saved. `cause` is the sentence that the settings page shows. */
export class ClaudeEnvironmentRefused extends Schema.TaggedError<ClaudeEnvironmentRefused>()(
  "ClaudeEnvironmentRefused",
  { cause: Schema.Defect() },
) {}

interface Variable {
  readonly name: string;
  readonly secret: boolean;
  /** Null for a secret that this computer cannot open now: it keeps its name and is not passed on. */
  readonly value: string | null;
}

interface StoredFile {
  /** Names in the order the person set them. */
  readonly order: readonly string[];
  readonly plain: ProviderEnvironment;
  /** One ciphertext of the values of every secret name, or absent when there is none. */
  readonly sealed: string | null;
  readonly secretNames: readonly string[];
}

/**
 * The variables that every Claude agent of this computer starts with. A value that is not a secret
 * is kept as text and shown again. A secret is encrypted in one ciphertext and never leaves main:
 * the settings page gets its name and a null value, and a row saved with a null value keeps it.
 * A Claude process reads the variables when it starts, so a change applies to the next process.
 *
 * A name that a later release refuses is dropped on load and the others stay. Electron-free, with
 * the cipher injected, so its tests need neither a keychain nor a display. A file saved by the first
 * build, which had one plain map, reads as variables that are not secrets.
 */
export class ClaudeEnvironmentStore {
  readonly #path: string;
  readonly #cipher: CustomProviderCipher;
  #variables: readonly Variable[] = [];
  #writes = Semaphore.makeUnsafe(1);

  constructor(options: { path: string; cipher: CustomProviderCipher }) {
    this.#path = options.path;
    this.#cipher = options.cipher;
  }

  load(): Effect.Effect<void, PreferenceFileFailure> {
    return Effect.gen({ self: this }, function* () {
      const loaded = yield* Effect.result(readPreferenceFile(this.#path, readStoredFile));
      if (Result.isSuccess(loaded)) {
        if (loaded.success) this.#variables = this.#open(loaded.success);
      } else if (!isMissingFileError(loaded.failure.cause) && !(loaded.failure.cause instanceof SyntaxError))
        return yield* loaded.failure;
    });
  }

  /** What the settings page shows: a secret has no value. */
  view(): ProviderEnvironmentState {
    return {
      entries: this.#variables.map(({ name, secret, value }) => ({ name, secret, value: secret ? null : value })),
    };
  }

  /** What a Claude process starts with. A secret that cannot be opened is left out. */
  values(): ProviderEnvironment {
    return Object.fromEntries(
      this.#variables.flatMap(({ name, value }): [string, string][] => (value === null ? [] : [[name, value]])),
    );
  }

  readonly set = Effect.fn("ClaudeEnvironment.set")((inputs: readonly ProviderEnvironmentInput[]) =>
    this.#writes.withPermit(
      Effect.uninterruptible(
        Effect.gen({ self: this }, function* () {
          const saved = new Map(this.#variables.filter((v) => v.secret).map((v) => [v.name, v.value]));
          const issue = providerEnvironmentInputIssue(inputs, new Set(saved.keys()));
          if (issue) return yield* new ClaudeEnvironmentRefused({ cause: new Error(issue) });
          const next: Variable[] = inputs.map((input) => ({
            name: input.name,
            secret: input.secret,
            value: input.value ?? saved.get(input.name) ?? null,
          }));
          const secrets = next.filter((v) => v.secret && v.value !== null);
          if (secrets.length > 0 && !this.#cipher.canPersist()) {
            return yield* new ClaudeEnvironmentRefused({
              cause: new Error(sourceText("error.provider.customAgentNoSecureStorage")),
            });
          }
          yield* writePreferenceFile(this.#path, { version: 1, ...this.#seal(next) });
          for (const secret of secrets) if (secret.value) registerSecretValue(secret.value);
          this.#variables = next;
          return this.view();
        }),
      ),
    ),
  );

  #seal(variables: readonly Variable[]) {
    const secrets = variables.filter((v) => v.secret);
    const values = Object.fromEntries(
      secrets.flatMap((v): [string, string][] => (v.value === null ? [] : [[v.name, v.value]])),
    );
    return {
      order: variables.map((v) => v.name),
      plain: Object.fromEntries(variables.filter((v) => !v.secret).map((v) => [v.name, v.value ?? ""])),
      secretNames: secrets.map((v) => v.name),
      sealed:
        Object.keys(values).length > 0 ? this.#cipher.encrypt(JSON.stringify({ values })).toString("base64") : null,
    };
  }

  #open(file: StoredFile): Variable[] {
    let secretValues: ProviderEnvironment = {};
    if (file.sealed) {
      try {
        const opened = JSON.parse(this.#cipher.decrypt(Buffer.from(file.sealed, "base64")));
        secretValues = isDynamicRecord(opened) ? readProviderEnvironment(opened.values) : {};
      } catch {
        secretValues = {};
      }
    }
    for (const value of Object.values(secretValues)) registerSecretValue(value);
    const secretNames = new Set(file.secretNames);
    return file.order.flatMap((name): Variable[] =>
      secretNames.has(name)
        ? [{ name, secret: true, value: secretValues[name] ?? null }]
        : name in file.plain
          ? [{ name, secret: false, value: file.plain[name] ?? "" }]
          : [],
    );
  }
}

/** A name that a later release refuses, or a row that is not text, reads as absent. */
function readStoredFile(parsed: unknown): StoredFile | null {
  if (!isDynamicRecord(parsed) || parsed.version !== 1) return null;
  // The first build kept `environment`, one plain map.
  const plain = readProviderEnvironment(parsed.plain ?? parsed.environment);
  const secretNames = Array.isArray(parsed.secretNames)
    ? parsed.secretNames.filter((name): name is string => typeof name === "string")
    : [];
  const order = Array.isArray(parsed.order)
    ? parsed.order.filter((name): name is string => typeof name === "string")
    : Object.keys(plain);
  return { order, plain, secretNames, sealed: typeof parsed.sealed === "string" ? parsed.sealed : null };
}
