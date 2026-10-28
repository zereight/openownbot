import { formatProviderEnvironment } from "@openbot/contracts/provider-environment";
import type { ProviderEnvironmentEditor } from "@openbot/ui/features/settings/ProviderSettingsPage";
import { useText } from "@openbot/ui/text";
import { createEffect, createStore } from "solid-js";

/**
 * The Claude page's environment variables of this computer. Undefined while `enabled` is false: a
 * joined server keeps its own, and the Team API does not carry them.
 */
export function createProviderClaudeEnvironment(enabled: () => boolean): () => ProviderEnvironmentEditor | undefined {
  const { t, errorMessage } = useText();
  const [state, setState] = createStore<{ text: string | null; pending: boolean; error: string | null }>({
    text: null,
    pending: false,
    error: null,
  });

  createEffect(enabled, (on) => {
    if (!on) return;
    window.openbot.getClaudeEnvironment().then(
      (next) =>
        setState((draft) => {
          draft.text = formatProviderEnvironment(next.environment);
        }),
      (error: unknown) =>
        setState((draft) => {
          draft.error = errorMessage(error, t("provider.settings.environmentLoadFailed"));
        }),
    );
  });

  async function save(text: string): Promise<void> {
    if (state.pending) return;
    setState((draft) => {
      draft.pending = true;
      draft.error = null;
    });
    try {
      const next = await window.openbot.setClaudeEnvironment(text);
      setState((draft) => {
        draft.text = formatProviderEnvironment(next.environment);
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
    get text() {
      return state.text;
    },
    get pending() {
      return state.pending;
    },
    get error() {
      return state.error;
    },
    onSave: (text) => void save(text),
  };
  return () => (enabled() ? editor : undefined);
}
