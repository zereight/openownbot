import {
  DECISION_MODEL_KEY_NAMES,
  DEFAULT_DECISION_MODEL_SETTINGS,
  type DecisionModelKeyName,
  type DecisionModelSettings,
  type DecisionModelState,
  isDecisionModelSettings,
  localDecisionOrigin,
  type SaveDecisionModelInput,
} from "@robot/contracts/ipc";
import { isDynamicRecord } from "@robot/contracts/runtime-values";
import { sourceText } from "@robot/i18n/source";
import { registerSecretValue } from "@robot/logging";
import { Effect, Result, Semaphore } from "effect";
import type { DecisionBackend } from "../backend/channel-decision";
import { isMissingFileError } from "../backend/file-errors";
import { PreferenceFileFailure, readPreferenceFile, writePreferenceFile } from "./preference-file";
import type { VoiceApiKeyCipher } from "./voice-api-key-store";

type SealedKeys = Partial<Record<DecisionModelKeyName, string>>;
type Keys = Partial<Record<DecisionModelKeyName, string>>;

function sealedKeys(value: unknown): SealedKeys | null {
  if (!isDynamicRecord(value) || value.version !== 1 || !isDynamicRecord(value.keys)) return null;
  const sealed: SealedKeys = {};
  for (const name of DECISION_MODEL_KEY_NAMES) {
    const entry = value.keys[name];
    if (typeof entry === "string") sealed[name] = entry;
  }
  return sealed;
}

/**
 * The fast decision model for channel requests. The settings are plain; the keys of Jev, OpenRouter and
 * Cloudflare are encrypted with the system cipher and stay in this process: the renderer learns only
 * whether each is saved. A key that this computer cannot decrypt reads as no key.
 */
export class DecisionModelStore {
  readonly #settingsPath: string;
  readonly #keysPath: string;
  readonly #cipher: VoiceApiKeyCipher;
  #settings: DecisionModelSettings = DEFAULT_DECISION_MODEL_SETTINGS;
  #keys: Keys = {};
  #writes = Semaphore.makeUnsafe(1);

  constructor(options: { settingsPath: string; keysPath: string; cipher: VoiceApiKeyCipher }) {
    this.#settingsPath = options.settingsPath;
    this.#keysPath = options.keysPath;
    this.#cipher = options.cipher;
  }

  load(): Effect.Effect<void, PreferenceFileFailure> {
    return Effect.gen({ self: this }, function* () {
      const settings = yield* Effect.result(
        readPreferenceFile(this.#settingsPath, (parsed): DecisionModelSettings | null =>
          // A file saved before the local server existed has no address or model for it: those take
          // their defaults, and everything the user chose stays.
          {
            if (!isDynamicRecord(parsed) || parsed.version !== 1 || !isDynamicRecord(parsed.settings)) return null;
            const upgraded = {
              localUrl: DEFAULT_DECISION_MODEL_SETTINGS.localUrl,
              localModel: DEFAULT_DECISION_MODEL_SETTINGS.localModel,
              computerUse: DEFAULT_DECISION_MODEL_SETTINGS.computerUse,
              ...parsed.settings,
            };
            return isDecisionModelSettings(upgraded) ? upgraded : null;
          },
        ),
      );
      if (Result.isFailure(settings)) {
        if (!isMissingFileError(settings.failure.cause) && !(settings.failure.cause instanceof SyntaxError))
          return yield* settings.failure;
      } else if (settings.success) this.#settings = settings.success;

      const keys = yield* Effect.result(readPreferenceFile(this.#keysPath, sealedKeys));
      if (Result.isFailure(keys)) {
        if (!isMissingFileError(keys.failure.cause) && !(keys.failure.cause instanceof SyntaxError))
          return yield* keys.failure;
        return;
      }
      const opened: Keys = {};
      for (const name of DECISION_MODEL_KEY_NAMES) {
        const sealed = keys.success?.[name];
        if (!sealed) continue;
        try {
          const key = this.#cipher.decrypt(Buffer.from(sealed, "base64"));
          if (key) {
            opened[name] = key;
            registerSecretValue(key);
          }
        } catch {
          // A cipher that changed reads as no key: the user saves it again.
        }
      }
      this.#keys = opened;
    });
  }

  state(): DecisionModelState {
    return {
      ...this.#settings,
      keys: {
        jev: !!this.#keys.jev,
        openrouter: !!this.#keys.openrouter,
        cloudflare: !!this.#keys.cloudflare,
        local: !!this.#keys.local,
      },
    };
  }

  /** The backend for the fast path of Computer Use: the chosen one, and only when the user allowed it. */
  resolveForComputerUse(): DecisionBackend | null {
    return this.#settings.computerUse ? this.resolve() : null;
  }

  /** The backend to ask, or null when none is chosen or the chosen one lacks what it needs. */
  resolve(): DecisionBackend | null {
    const { backend, openrouterModel, cloudflareAccountId, cloudflareModel, localUrl, localModel } = this.#settings;
    switch (backend) {
      case "jev":
        return this.#keys.jev ? { kind: "jev", apiKey: this.#keys.jev } : null;
      case "openrouter":
        return this.#keys.openrouter && openrouterModel.trim()
          ? { kind: "openrouter", apiKey: this.#keys.openrouter, model: openrouterModel.trim() }
          : null;
      case "cloudflare":
        return this.#keys.cloudflare && cloudflareAccountId
          ? {
              kind: "cloudflare",
              accountId: cloudflareAccountId,
              apiToken: this.#keys.cloudflare,
              model: cloudflareModel,
            }
          : null;
      case "local": {
        const baseUrl = localDecisionOrigin(localUrl);
        return baseUrl
          ? { kind: "local", baseUrl, apiKey: this.#keys.local ?? null, model: localModel.trim() || "english" }
          : null;
      }
      case "off":
        return null;
    }
  }

  readonly save = Effect.fn("DecisionModel.save")(function* (this: DecisionModelStore, input: SaveDecisionModelInput) {
    return yield* this.#writes.withPermit(
      Effect.uninterruptible(
        Effect.gen({ self: this }, function* () {
          const { keys: updates, ...settings } = input;
          const next: Keys = { ...this.#keys };
          for (const name of DECISION_MODEL_KEY_NAMES) {
            const update = updates?.[name];
            if (update === null) delete next[name];
            else if (typeof update === "string") next[name] = update;
          }
          const saving = DECISION_MODEL_KEY_NAMES.some((name) => typeof updates?.[name] === "string");
          if (saving && !this.#cipher.canPersist())
            return yield* new PreferenceFileFailure({
              cause: new Error(sourceText("error.app.secretStorageUnavailable")),
            });
          if (
            DECISION_MODEL_KEY_NAMES.some((name) => updates?.[name] === null || typeof updates?.[name] === "string")
          ) {
            const sealed: SealedKeys = {};
            for (const name of DECISION_MODEL_KEY_NAMES) {
              const key = next[name];
              if (key) {
                registerSecretValue(key);
                sealed[name] = this.#cipher.encrypt(key).toString("base64");
              }
            }
            yield* writePreferenceFile(this.#keysPath, { version: 1, keys: sealed });
          }
          yield* writePreferenceFile(this.#settingsPath, { version: 1, settings });
          this.#keys = next;
          this.#settings = settings;
          return this.state();
        }),
      ),
    );
  });
}
