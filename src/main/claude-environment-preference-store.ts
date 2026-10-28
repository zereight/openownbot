import { type ProviderEnvironment, readProviderEnvironment } from "@openbot/contracts/provider-environment";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { PreferenceStore } from "./preference-file";

export interface ClaudeEnvironmentPreference {
  environment: ProviderEnvironment;
}

/**
 * The variables that every Claude agent of this computer starts with. A Claude process reads them
 * when it starts, so a change applies to the next process, not to a running turn.
 *
 * A name that a later release refuses is dropped on load and the other variables stay: see
 * `readProviderEnvironment`.
 */
export function createClaudeEnvironmentPreferenceStore(path: string): PreferenceStore<ClaudeEnvironmentPreference> {
  return new PreferenceStore<ClaudeEnvironmentPreference>({
    path,
    defaultValue: { environment: {} },
    decode: (parsed) =>
      isDynamicRecord(parsed) && parsed.version === 1
        ? { environment: readProviderEnvironment(parsed.environment) }
        : null,
  });
}
