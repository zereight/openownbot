import type { ClientAgentSummary } from "@openownbot/contracts/ipc";
import {
  Alert,
  AlertContent,
  AlertDescription,
  ArchiveRestore,
  Button,
  Hash,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  SettingsSection,
} from "@openownbot/ui";
import { For, Show } from "solid-js";
import { useText } from "../../text";
import { AgentAvatar } from "../agents/AgentAvatar";

/** An agent as the Archive tab shows it. */
export type ArchiveAgent = Pick<ClientAgentSummary, "id" | "name" | "avatarSeed" | "avatarHue" | "avatarUrl">;

export interface ArchiveHiddenAgent {
  agent: ArchiveAgent;
  /** ISO 8601 time of the hide. */
  hiddenAt: string;
}

export interface ArchiveChannel {
  id: string;
  title: string;
}

export interface SettingsArchiveTabProps {
  hiddenAgents: readonly ArchiveHiddenAgent[];
  archivedChannels: readonly ArchiveChannel[];
  /** True when the lists could not be read. */
  loadFailed: boolean;
  /** The ids of the agents and channels with a restore in progress. */
  restoring: readonly string[];
  onRestoreAgent: (agentId: string) => void;
  onRestoreChannel: (channelId: string) => void;
}

/**
 * Settings › Archive: the agents a user hid and the channels a user archived, each with a Restore
 * button. The tab holds no state of its own. Its owner reads the lists and runs the restores.
 */
export function SettingsArchiveTab(props: SettingsArchiveTabProps) {
  const { t, format } = useText();
  return (
    <>
      <Show when={props.loadFailed}>
        <Alert tone="danger" role="alert" report={{ operation: "settings", source: "system", cause_code: "unknown" }}>
          <AlertContent>
            <AlertDescription>{t("settings.archive.loadFailed")}</AlertDescription>
          </AlertContent>
        </Alert>
      </Show>
      <SettingsSection
        title={t("settings.archive.agents.title")}
        description={t("settings.archive.agents.description")}
      >
        <ItemGroup class="settings-modal-card">
          <For
            each={props.hiddenAgents}
            fallback={
              <Item class="settings-modal-row">
                <ItemContent>
                  <ItemDescription>{t("settings.archive.agents.empty")}</ItemDescription>
                </ItemContent>
              </Item>
            }
          >
            {(entry) => (
              <Item class="settings-modal-row">
                <ItemMedia>
                  <span class="integrations-agent-face" data-size="md">
                    <AgentAvatar agent={entry.agent} motion="idle" />
                  </span>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{entry.agent.name}</ItemTitle>
                  <ItemDescription>
                    {t("settings.archive.agents.since", {
                      date: format.date(new Date(entry.hiddenAt), { month: "short", day: "numeric" }),
                    })}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={props.restoring.includes(entry.agent.id)}
                    aria-label={t("settings.archive.restoreLabel", { name: entry.agent.name })}
                    onClick={() => props.onRestoreAgent(entry.agent.id)}
                  >
                    <ArchiveRestore aria-hidden="true" />
                    {t("settings.archive.restore")}
                  </Button>
                </ItemActions>
              </Item>
            )}
          </For>
        </ItemGroup>
      </SettingsSection>
      <SettingsSection
        title={t("settings.archive.channels.title")}
        description={t("settings.archive.channels.description")}
      >
        <ItemGroup class="settings-modal-card">
          <For
            each={props.archivedChannels}
            fallback={
              <Item class="settings-modal-row">
                <ItemContent>
                  <ItemDescription>{t("settings.archive.channels.empty")}</ItemDescription>
                </ItemContent>
              </Item>
            }
          >
            {(channel) => (
              <Item class="settings-modal-row">
                <ItemMedia>
                  <Hash aria-hidden="true" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{channel.title}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={props.restoring.includes(channel.id)}
                    aria-label={t("settings.archive.restoreLabel", { name: channel.title })}
                    onClick={() => props.onRestoreChannel(channel.id)}
                  >
                    <ArchiveRestore aria-hidden="true" />
                    {t("settings.archive.restore")}
                  </Button>
                </ItemActions>
              </Item>
            )}
          </For>
        </ItemGroup>
      </SettingsSection>
    </>
  );
}
