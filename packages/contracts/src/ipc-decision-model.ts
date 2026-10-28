import { isDynamicRecord, isOneOf } from "./runtime-values";

/**
 * The fast decision model that picks the member for a channel request that names none. `off` leaves it to
 * the lead's own model, which is also what every other choice does when the model fails or is unsure.
 */
export const DECISION_MODEL_BACKENDS = ["off", "jev", "openrouter", "cloudflare"] as const;
export type DecisionModelBackend = (typeof DECISION_MODEL_BACKENDS)[number];

export const CLOUDFLARE_DECISION_MODELS = ["clef-flash", "clef"] as const;
export type CloudflareDecisionModel = (typeof CLOUDFLARE_DECISION_MODELS)[number];

export const DEFAULT_OPENROUTER_DECISION_MODEL = "typesafe/jev-1.14";
export const DECISION_MODEL_FIELD_LIMIT = 200;
export const DECISION_MODEL_KEY_LIMIT = 500;
export const CLOUDFLARE_ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/;

export interface DecisionModelSettings {
  backend: DecisionModelBackend;
  openrouterModel: string;
  /** The 32 hexadecimal characters of a Cloudflare account, or empty. It is no secret. */
  cloudflareAccountId: string;
  cloudflareModel: CloudflareDecisionModel;
}

export const DEFAULT_DECISION_MODEL_SETTINGS: DecisionModelSettings = {
  backend: "off",
  openrouterModel: DEFAULT_OPENROUTER_DECISION_MODEL,
  cloudflareAccountId: "",
  cloudflareModel: "clef-flash",
};

export const DECISION_MODEL_KEY_NAMES = ["jev", "openrouter", "cloudflare"] as const;
export type DecisionModelKeyName = (typeof DECISION_MODEL_KEY_NAMES)[number];

/** What the renderer reads: the settings, and for each key only whether one is saved. */
export interface DecisionModelState extends DecisionModelSettings {
  keys: Record<DecisionModelKeyName, boolean>;
}

/** A key that is absent stays as it is, null removes it, and a string saves it. */
export interface SaveDecisionModelInput extends DecisionModelSettings {
  keys?: Partial<Record<DecisionModelKeyName, string | null>>;
}

/** The answer of a trial request with sample members. `picked` is the sample member that was chosen. */
export interface DecisionModelTestResult {
  ok: boolean;
  /** Why no member was chosen: `not-set-up`, `timeout`, `network`, `http-401`, `none`, `below-threshold`, ... */
  reason: string | null;
  picked: string | null;
  milliseconds: number;
}

export function isDecisionModelBackend(value: unknown): value is DecisionModelBackend {
  return isOneOf(DECISION_MODEL_BACKENDS, value);
}

export function isCloudflareDecisionModel(value: unknown): value is CloudflareDecisionModel {
  return isOneOf(CLOUDFLARE_DECISION_MODELS, value);
}

export function isDecisionModelSettings(value: unknown): value is DecisionModelSettings {
  return (
    isDynamicRecord(value) &&
    isDecisionModelBackend(value.backend) &&
    typeof value.openrouterModel === "string" &&
    value.openrouterModel.length <= DECISION_MODEL_FIELD_LIMIT &&
    typeof value.cloudflareAccountId === "string" &&
    (value.cloudflareAccountId === "" || CLOUDFLARE_ACCOUNT_ID_PATTERN.test(value.cloudflareAccountId)) &&
    isCloudflareDecisionModel(value.cloudflareModel)
  );
}

export function isDecisionModelState(value: unknown): value is DecisionModelState {
  return (
    isDecisionModelSettings(value) &&
    isDynamicRecord(value) &&
    isDynamicRecord(value.keys) &&
    DECISION_MODEL_KEY_NAMES.every(
      (name) => typeof (isDynamicRecord(value.keys) ? value.keys[name] : null) === "boolean",
    )
  );
}
