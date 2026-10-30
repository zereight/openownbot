import {
  type ChannelSummary,
  type ClientAgentSummary,
  type HiddenAgent,
  LOCAL_SERVER_ID,
} from "@openownbot/contracts/ipc";
import { SettingsArchiveTab } from "@openownbot/ui/features/settings/SettingsArchiveTab";
import { currentText } from "@openownbot/ui/text";
import type { JSX } from "@solidjs/web";
import { createEffect, createStore } from "solid-js";
import { actionToast } from "../../action-toast";
import { settingsPort } from "./settings-port";

interface ArchiveSectionState {
  agents: ClientAgentSummary[];
  hidden: HiddenAgent[];
  channels: ChannelSummary[];
  loadFailed: boolean;
  /** The ids of the agents and channels with a restore in progress. */
  restoring: string[];
}

export interface SettingsArchiveSection {
  Panel: () => JSX.Element;
}

/**
 * Settings › Archive: the agents hidden and the channels archived on this computer, with a restore
 * for each. Like the Agents tab it reads the local server each time it shows, whichever server is open.
 */
export function createSettingsArchiveSection(options: { visible: () => boolean }): SettingsArchiveSection {
  const [state, setState] = createStore<ArchiveSectionState>({
    agents: [],
    hidden: [],
    channels: [],
    loadFailed: false,
    restoring: [],
  });
  /** Bumped for each read, so an answer of an earlier read is dropped. */
  let generation = 0;

  function load(): void {
    const current = ++generation;
    const { agent } = settingsPort();
    Promise.all([
      agent.listAgents(LOCAL_SERVER_ID),
      agent.listHiddenAgents(LOCAL_SERVER_ID),
      agent.listChannels(LOCAL_SERVER_ID),
    ])
      .then(([agents, hidden, channels]) => {
        if (current !== generation) return;
        setState((draft) => {
          draft.agents = agents;
          draft.hidden = hidden.agents;
          draft.channels = channels;
          draft.loadFailed = false;
        });
      })
      .catch(() => {
        if (current !== generation) return;
        setState((draft) => {
          draft.loadFailed = true;
        });
      });
  }

  createEffect(options.visible, (visible) => {
    if (visible) load();
  });

  function setRestoring(id: string, on: boolean): void {
    setState((draft) => {
      draft.restoring = on
        ? [...draft.restoring.filter((item) => item !== id), id]
        : draft.restoring.filter((item) => item !== id);
    });
  }

  function showRestoreFailure(name: string, error: unknown): void {
    const { t, errorMessage } = currentText();
    actionToast.error(errorMessage(error, t("settings.archive.restoreFailed", { name })), {
      id: "settings-archive-restore-failed",
      report: { operation: "settings", source: "action", cause_code: "unknown" },
    });
  }

  function restoreAgent(agentId: string): void {
    const name = state.agents.find((agent) => agent.id === agentId)?.name ?? agentId;
    setRestoring(agentId, true);
    settingsPort()
      .agent.setAgentHidden({ agentId, hidden: false }, LOCAL_SERVER_ID)
      .then((snapshot) => {
        setState((draft) => {
          draft.hidden = snapshot.agents;
        });
      })
      .catch((error: unknown) => showRestoreFailure(name, error))
      .finally(() => setRestoring(agentId, false));
  }

  function restoreChannel(channelId: string): void {
    const name = state.channels.find((channel) => channel.id === channelId)?.title ?? channelId;
    setRestoring(channelId, true);
    settingsPort()
      .agent.channelCommand({ type: "restore", channelId, operationId: crypto.randomUUID() }, LOCAL_SERVER_ID)
      .then(() => {
        setState((draft) => {
          draft.channels = draft.channels.filter((channel) => channel.id !== channelId);
        });
      })
      .catch((error: unknown) => showRestoreFailure(name, error))
      .finally(() => setRestoring(channelId, false));
  }

  const hiddenAgents = () =>
    state.hidden.flatMap((entry) => {
      const agent = state.agents.find((candidate) => candidate.id === entry.agentId);
      return agent ? [{ agent, hiddenAt: entry.hiddenAt }] : [];
    });
  const archivedChannels = () =>
    state.channels
      .filter((channel) => channel.archived)
      .map((channel) => ({ id: channel.id, title: channel.title.trim() || channel.name }));

  return {
    Panel: () => (
      <SettingsArchiveTab
        hiddenAgents={hiddenAgents()}
        archivedChannels={archivedChannels()}
        loadFailed={state.loadFailed}
        restoring={state.restoring}
        onRestoreAgent={restoreAgent}
        onRestoreChannel={restoreChannel}
      />
    ),
  };
}
