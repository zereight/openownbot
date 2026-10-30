import type { ProviderEnvironmentEntry, ProviderEnvironmentInput } from "@robot/contracts/provider-environment";
import type { ProviderEnvironmentEditor } from "@robot/ui/features/settings/ProviderSettingsPage";
import { useText } from "@robot/ui/text";
import { createEffect, createStore } from "solid-js";

/**
 * The Claude page's environment variables of this computer. Undefined while `enabled` is false: a
 * joined server keeps its own, and the Team API does not carry them. The value of a secret never
 * reaches this store: main sends the name only.
 */
export function createProviderClaudeEnvironment(enabled: () => boolean): () => ProviderEnvironmentEditor | undefined {
  const { t, errorMessage } = useText();
  const [state, setState] = createStore<{
    entries: ProviderEnvironmentEntry[] | null;
    pending: boolean;
    error: string | null;
  }>({ entries: null, pending: false, error: null });

  createEffect(enabled, (on) => {
    if (!on) return;
    window.openownbot.getClaudeEnvironment().then(
      (next) =>
        setState((draft) => {
          draft.entries = next.entries;
        }),
      (error: unknown) =>
        setState((draft) => {
          draft.error = errorMessage(error, t("provider.settings.environmentLoadFailed"));
        }),
    );
  });

  async function save(inputs: ProviderEnvironmentInput[]): Promise<void> {
    if (state.pending) return;
    setState((draft) => {
      draft.pending = true;
      draft.error = null;
    });
    try {
      const next = await window.openownbot.setClaudeEnvironment(inputs);
      setState((draft) => {
        draft.entries = next.entries;
      });
    } catch (error) {
      setState((draft) => {
        draft.error = errorMessage(error, t("error.provider.useChangeFailed"));
      });
    } finally {
      setState((draft) => {
        draft.pending = false;
      });
    }
  }

  const editor: ProviderEnvironmentEditor = {
    get entries() {
      return state.entries;
    },
    get pending() {
      return state.pending;
    },
    get error() {
      return state.error;
    },
    onSave: (inputs) => void save(inputs),
  };
  return () => (enabled() ? editor : undefined);
}
