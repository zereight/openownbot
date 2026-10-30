import {
  DECISION_MODEL_KEY_LIMIT,
  DECISION_MODEL_KEY_NAMES,
  type DecisionModelKeyName,
  isDecisionModelSettings,
  localDecisionOrigin,
  type SaveDecisionModelInput,
} from "@robot/contracts/ipc";
import { isDynamicRecord } from "@robot/contracts/runtime-values";
import { sourceText } from "@robot/i18n/source";

/** The one place the decision model settings and keys from the renderer enter main. */
export function parseSaveDecisionModel(input: unknown): SaveDecisionModelInput {
  if (
    isDynamicRecord(input) &&
    typeof input.localUrl === "string" &&
    input.localUrl.trim() !== "" &&
    localDecisionOrigin(input.localUrl) === null
  )
    throw new Error(sourceText("error.provider.decisionLocalUrlInvalid"));
  if (!isDynamicRecord(input) || !isDecisionModelSettings(input))
    throw new Error("The decision model settings are not valid.");
  const { backend, openrouterModel, cloudflareAccountId, cloudflareModel, localUrl, localModel, computerUse } = input;
  const settings = {
    backend,
    openrouterModel,
    cloudflareAccountId,
    cloudflareModel,
    localUrl,
    localModel,
    computerUse,
  };
  if (input.keys === undefined) return settings;
  if (!isDynamicRecord(input.keys)) throw new Error("The decision model keys are not valid.");
  const keys: Partial<Record<DecisionModelKeyName, string | null>> = {};
  for (const name of DECISION_MODEL_KEY_NAMES) {
    const key = input.keys[name];
    if (key === undefined) continue;
    if (key === null) {
      keys[name] = null;
      continue;
    }
    if (typeof key !== "string" || !key.trim()) throw new Error(sourceText("error.provider.keyRequired"));
    if (key.length > DECISION_MODEL_KEY_LIMIT) throw new Error(sourceText("error.provider.keyTooLong"));
    // The key goes into an HTTP header.
    if (!/^[\x21-\x7e]+$/u.test(key.trim())) throw new Error(sourceText("error.provider.keyInvalidCharacters"));
    keys[name] = key.trim();
  }
  return { ...settings, keys };
}
