import { type ClientAgentSummary, LOCAL_SERVER_ID } from "@openownbot/contracts/ipc";
import { SettingsTitlesTab, type TitleGroup } from "@openownbot/ui/features/settings/SettingsTitlesTab";
import { currentText } from "@openownbot/ui/text";
import type { JSX } from "@solidjs/web";
import { createEffect, createStore } from "solid-js";
import { actionToast } from "../../action-toast";
import { settingsPort } from "./settings-port";

interface TitlesSectionState {
  agents: ClientAgentSummary[];
  loadFailed: boolean;
  /** The titles with a rename or a removal in progress. */
  busy: string[];
}

export interface SettingsTitlesSection {
  Panel: () => JSX.Element;
}

/** Titles match without regard to case, so "Designer" and "designer" are one title. */
function titleKey(title: string): string {
  return title.trim().toLocaleLowerCase();
}

/** The titles that agents carry, each with its agents. The first spelling found is the one shown. */
function groupByTitle(agents: readonly ClientAgentSummary[]): TitleGroup[] {
  const groups = new Map<string, { title: string; agents: ClientAgentSummary[] }>();
  for (const agent of agents) {
    const title = agent.title.trim();
    if (!title) continue;
    const key = titleKey(title);
    const group = groups.get(key);
    if (group) group.agents.push(agent);
    else groups.set(key, { title, agents: [agent] });
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Settings › Titles: the titles of the agents on this computer. A title is not stored on its own: it
 * is the `title` of each agent that carries it. A rename or a removal therefore writes every agent of
 * the title. Like the Agents tab, the section reads the local server each time it shows.
 */
export function createSettingsTitlesSection(options: { visible: () => boolean }): SettingsTitlesSection {
  const [state, setState] = createStore<TitlesSectionState>({ agents: [], loadFailed: false, busy: [] });
  /** Bumped for each read, so an answer of an earlier read is dropped. */
  let generation = 0;

  function load(): void {
    const current = ++generation;
    settingsPort()
      .agent.listAgents(LOCAL_SERVER_ID)
      .then((agents) => {
        if (current !== generation) return;
        setState((draft) => {
          draft.agents = agents;
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

  function setBusy(title: string, on: boolean): void {
    setState((draft) => {
      draft.busy = on
        ? [...draft.busy.filter((item) => item !== title), title]
        : draft.busy.filter((item) => item !== title);
    });
  }

  /** Writes `next` as the title of every agent that carries `title`. An empty `next` removes the title. */
  function retitle(
    title: string,
    next: string,
    failedKey: "settings.titles.renameFailed" | "settings.titles.removeFailed",
  ): void {
    const key = titleKey(title);
    const targets = state.agents.filter((agent) => titleKey(agent.title) === key);
    setBusy(title, true);
    Promise.all(
      targets.map((agent) => settingsPort().agent.updateAgent({ agentId: agent.id, title: next }, LOCAL_SERVER_ID)),
    )
      .catch((error: unknown) => {
        const { t, errorMessage } = currentText();
        actionToast.error(errorMessage(error, t(failedKey, { title })), {
          id: "settings-titles-save-failed",
          report: { operation: "settings", source: "action", cause_code: "unknown" },
        });
      })
      .finally(() => {
        setBusy(title, false);
        load();
      });
  }

  return {
    Panel: () => (
      <SettingsTitlesTab
        groups={groupByTitle(state.agents)}
        loadFailed={state.loadFailed}
        busy={state.busy}
        onRename={(title, next) => retitle(title, next, "settings.titles.renameFailed")}
        onRemove={(title) => retitle(title, "", "settings.titles.removeFailed")}
      />
    ),
  };
}
