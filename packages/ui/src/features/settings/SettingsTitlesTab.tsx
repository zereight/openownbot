import { INPUT_LIMITS } from "@openownbot/contracts/input-limits";
import type { ClientAgentSummary } from "@openownbot/contracts/ipc";
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  ConfirmDialog,
  IconButton,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Pencil,
  SettingsSection,
  Tag,
  Trash2,
} from "@openownbot/ui";
import { createSignal, For, Show } from "solid-js";
import { useText } from "../../text";
import { AgentAvatar } from "../agents/AgentAvatar";

/** An agent as the Titles tab shows it. */
export type TitleAgent = Pick<ClientAgentSummary, "id" | "name" | "avatarSeed" | "avatarHue" | "avatarUrl">;

/** One title and the agents that carry it. */
export interface TitleGroup {
  title: string;
  agents: readonly TitleAgent[];
}

export interface SettingsTitlesTabProps {
  groups: readonly TitleGroup[];
  /** True when the agents could not be read. */
  loadFailed: boolean;
  /** The titles with a rename or a removal in progress. */
  busy: readonly string[];
  onRename: (title: string, next: string) => void;
  onRemove: (title: string) => void;
}

/**
 * Settings › Titles: each title that an agent carries, with its agents, a rename and a removal. A title
 * exists while an agent carries it, so a new title starts in the settings of an agent. The tab keeps
 * only the title in edit and the title to remove. Its owner reads the agents and writes the changes.
 */
export function SettingsTitlesTab(props: SettingsTitlesTabProps) {
  const { t } = useText();
  const [editing, setEditing] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal("");
  const [removing, setRemoving] = createSignal<string | null>(null);

  function startEdit(title: string): void {
    setDraft(title);
    setEditing(title);
  }

  function commitEdit(title: string): void {
    const next = draft().trim();
    setEditing(null);
    if (next && next !== title) props.onRename(title, next);
  }

  return (
    <>
      <Show when={props.loadFailed}>
        <Alert tone="danger" role="alert" report={{ operation: "settings", source: "system", cause_code: "unknown" }}>
          <AlertContent>
            <AlertDescription>{t("settings.titles.loadFailed")}</AlertDescription>
          </AlertContent>
        </Alert>
      </Show>
      <SettingsSection
        title={t("settings.titles.section.title")}
        description={t("settings.titles.section.description")}
      >
        <ItemGroup class="settings-modal-card">
          <For
            each={props.groups}
            fallback={
              <Item class="settings-modal-row">
                <ItemContent>
                  <ItemDescription>{t("settings.titles.empty")}</ItemDescription>
                </ItemContent>
              </Item>
            }
          >
            {(group) => (
              <Item class="settings-modal-row">
                <ItemMedia>
                  <Tag aria-hidden="true" />
                </ItemMedia>
                <ItemContent>
                  <Show when={editing() === group.title} fallback={<ItemTitle>{group.title}</ItemTitle>}>
                    <Input
                      value={draft()}
                      aria-label={t("settings.titles.renameInputLabel", { title: group.title })}
                      maxlength={INPUT_LIMITS.agentTitle}
                      onValueChange={setDraft}
                      onKeyDown={(event: KeyboardEvent) => {
                        if (event.key === "Enter") commitEdit(group.title);
                        if (event.key === "Escape") setEditing(null);
                      }}
                    />
                  </Show>
                  <ItemDescription class="settings-titles-agents">
                    <For each={group.agents}>
                      {(agent) => (
                        <span class="settings-titles-agent">
                          <span class="integrations-agent-face" data-size="sm">
                            <AgentAvatar agent={agent} motion="idle" />
                          </span>
                          {agent.name}
                        </span>
                      )}
                    </For>
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Show
                    when={editing() === group.title}
                    fallback={
                      <>
                        <IconButton
                          variant="outline"
                          type="button"
                          disabled={props.busy.includes(group.title)}
                          label={t("settings.titles.renameLabel", { title: group.title })}
                          onClick={() => startEdit(group.title)}
                        >
                          <Pencil aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          variant="outline"
                          type="button"
                          disabled={props.busy.includes(group.title)}
                          label={t("settings.titles.removeLabel", { title: group.title })}
                          onClick={() => setRemoving(group.title)}
                        >
                          <Trash2 aria-hidden="true" />
                        </IconButton>
                      </>
                    }
                  >
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>
                      {t("settings.titles.cancel")}
                    </Button>
                    <Button type="button" size="sm" onClick={() => commitEdit(group.title)}>
                      {t("settings.titles.save")}
                    </Button>
                  </Show>
                </ItemActions>
              </Item>
            )}
          </For>
        </ItemGroup>
      </SettingsSection>
      <ConfirmDialog
        open={removing() !== null}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const title = removing();
          setRemoving(null);
          if (title !== null) props.onRemove(title);
        }}
        title={t("settings.titles.remove.confirmTitle", { title: removing() ?? "" })}
        description={t("settings.titles.remove.confirmDescription")}
        confirmLabel={t("settings.titles.remove.confirm")}
      />
    </>
  );
}
