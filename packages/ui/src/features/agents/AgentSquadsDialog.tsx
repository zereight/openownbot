import type { AgentSquad, SaveSquadInput } from "@openbot/contracts/ipc";
import { classifyFailure } from "@openbot/telemetry";
import { Button, Checkbox, Dialog, Heading, IconButton, Input, NativeSelect, Text, toast, X } from "@openbot/ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { useText } from "../../text";

export interface SquadAgentOption {
  id: string;
  name: string;
}

export interface AgentSquadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  squads: AgentSquad[];
  agents: SquadAgentOption[];
  onSave: (input: SaveSquadInput) => Promise<void>;
  onRemove: (squadId: string) => Promise<void>;
}

interface Draft {
  id?: string;
  name: string;
  leadAgentId: string;
  memberAgentIds: string[];
}

/**
 * Where the user makes teams: a name, one lead and the members. Only this screen edits a team, so an
 * agent cannot move itself into one or take its lead.
 */
export function AgentSquadsDialog(props: AgentSquadsDialogProps) {
  const { t, errorMessage } = useText();
  const [draft, setDraft] = createSignal<Draft | null>(null);
  const [busy, setBusy] = createSignal(false);

  // The lead alone decides who can be a member. Reading the whole draft here would rebuild the rows each
  // time a box is checked or a letter is typed, and a long list would jump back to its top.
  const leadId = createMemo(() => draft()?.leadAgentId ?? "");
  const candidates = createMemo(() => props.agents.filter((agent) => agent.id !== leadId()));

  const agentName = (id: string) => props.agents.find((agent) => agent.id === id)?.name ?? id;

  function startNew(): void {
    const first = props.agents[0];
    setDraft({ name: "", leadAgentId: first?.id ?? "", memberAgentIds: [] });
  }

  function startEdit(squad: AgentSquad): void {
    setDraft({
      id: squad.id,
      name: squad.name,
      leadAgentId: squad.leadAgentId,
      memberAgentIds: [...squad.memberAgentIds],
    });
  }

  function setLead(leadAgentId: string): void {
    const current = draft();
    if (current)
      setDraft({
        ...current,
        leadAgentId,
        memberAgentIds: current.memberAgentIds.filter((id) => id !== leadAgentId),
      });
  }

  function toggleMember(agentId: string, checked: boolean): void {
    const current = draft();
    if (!current) return;
    const rest = current.memberAgentIds.filter((id) => id !== agentId);
    setDraft({ ...current, memberAgentIds: checked ? [...rest, agentId] : rest });
  }

  async function run(operation: () => Promise<void>, failure: string): Promise<boolean> {
    setBusy(true);
    try {
      await operation();
      return true;
    } catch (error) {
      toast.error(errorMessage(error, failure), {
        report: { operation: "agent", source: "action", cause_code: classifyFailure(error) },
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    const current = draft();
    if (!current) return;
    const saved = await run(
      () =>
        props.onSave({
          ...(current.id === undefined ? {} : { id: current.id }),
          name: current.name,
          leadAgentId: current.leadAgentId,
          memberAgentIds: current.memberAgentIds,
        }),
      t("agentTeam.manage.saveFailed"),
    );
    if (saved) setDraft(null);
  }

  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) setDraft(null);
        props.onOpenChange(open);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="agent-template-backdrop">
          <Dialog.Content as="section" class="agent-template-dialog" aria-busy={busy() ? "true" : undefined}>
            <Dialog.Title class="sr-only">{t("agentTeam.manage.title")}</Dialog.Title>
            <Dialog.Description class="sr-only">{t("agentTeam.manage.description")}</Dialog.Description>
            <div class="agent-template-corner-actions">
              <IconButton label={t("common.close")} variant="ghost" onClick={() => props.onOpenChange(false)}>
                <X />
              </IconButton>
            </div>
            <Show
              when={draft()}
              fallback={
                <>
                  <div class="agent-template-body agent-template-scroll">
                    <Heading as="h2" size="md" class="agent-squads-title">
                      {t("agentTeam.manage.title")}
                    </Heading>
                    <Text tone="muted" variant="caption">
                      {t("agentTeam.manage.description")}
                    </Text>
                    <Show
                      when={props.squads.length > 0}
                      fallback={<Text tone="muted">{t("agentTeam.manage.empty")}</Text>}
                    >
                      <For each={props.squads}>
                        {(squad) => (
                          <div class="agent-squads-row">
                            <div class="agent-squads-row-text">
                              <Heading as="h3" size="sm">
                                {squad.name}
                              </Heading>
                              <Text tone="muted" variant="caption">
                                {t("agentTeam.manage.summary", {
                                  lead: agentName(squad.leadAgentId),
                                  count: squad.memberAgentIds.length,
                                })}
                              </Text>
                            </div>
                            <div class="agent-squads-row-actions">
                              <Button type="button" variant="ghost" disabled={busy()} onClick={() => startEdit(squad)}>
                                {t("agentTeam.manage.edit")}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={busy()}
                                onClick={() =>
                                  void run(() => props.onRemove(squad.id), t("agentTeam.manage.deleteFailed"))
                                }
                              >
                                {t("agentTeam.manage.delete")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                  <footer class="agent-template-actions">
                    <Button
                      type="button"
                      variant="default"
                      disabled={busy() || props.agents.length === 0}
                      onClick={startNew}
                    >
                      {t("agentTeam.manage.new")}
                    </Button>
                  </footer>
                </>
              }
            >
              {(current) => (
                <>
                  <div class="agent-template-body agent-template-scroll">
                    <Heading as="h2" size="md" class="agent-squads-title">
                      {current().id === undefined ? t("agentTeam.manage.new") : t("agentTeam.manage.edit")}
                    </Heading>
                    <div class="agent-squads-field">
                      <Heading as="h3" size="sm">
                        {t("agentTeam.manage.name")}
                      </Heading>
                      <Input
                        aria-label={t("agentTeam.manage.name")}
                        value={current().name}
                        onInput={(event) => setDraft({ ...current(), name: event.currentTarget.value })}
                      />
                    </div>
                    <div class="agent-squads-field">
                      <Heading as="h3" size="sm">
                        {t("agentTeam.manage.lead")}
                      </Heading>
                      <NativeSelect
                        aria-label={t("agentTeam.manage.lead")}
                        value={current().leadAgentId}
                        onChange={(event) => setLead(event.currentTarget.value)}
                      >
                        <For each={props.agents} keyed={(agent) => agent.id}>
                          {(agent) => <option value={agent().id}>{agent().name}</option>}
                        </For>
                      </NativeSelect>
                    </div>
                    <div class="agent-squads-field">
                      <Heading as="h3" size="sm">
                        {t("agentTeam.manage.members")}
                      </Heading>
                      <div class="agent-squads-members">
                        <For each={candidates()} keyed={(agent) => agent.id}>
                          {(agent) => (
                            <div class="agent-squads-member">
                              <Checkbox
                                id={`squad-member-${agent().id}`}
                                checked={current().memberAgentIds.includes(agent().id)}
                                onChange={(event) => toggleMember(agent().id, event.currentTarget.checked)}
                              />
                              <label for={`squad-member-${agent().id}`}>{agent().name}</label>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  </div>
                  <footer class="agent-template-actions">
                    <Button type="button" variant="ghost" disabled={busy()} onClick={() => setDraft(null)}>
                      {t("agentTeam.manage.back")}
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      disabled={busy() || current().name.trim() === "" || current().leadAgentId === ""}
                      onClick={() => void save()}
                    >
                      {busy() ? t("agentTeam.manage.saving") : t("agentTeam.manage.save")}
                    </Button>
                  </footer>
                </>
              )}
            </Show>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
