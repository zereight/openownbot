import type { AgentTeamPreview } from "@openbot/contracts/ipc";
import { classifyFailure } from "@openbot/telemetry";
import { Button, Dialog, Heading, IconButton, Text, toast, X } from "@openbot/ui";
import { createSignal, For, Show } from "solid-js";
import { useText } from "../../text";

export type AgentTeamImportPreview = Extract<AgentTeamPreview, { ok: true }>;

export interface AgentTeamImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the import would create. Null while no file is chosen. */
  preview: AgentTeamImportPreview | null;
  onImport: () => Promise<void>;
}

/**
 * Shows what a team file would create before anything is made: a file from someone else carries
 * instructions an agent will follow, so choosing it never adds an agent by itself.
 */
export function AgentTeamImportDialog(props: AgentTeamImportDialogProps) {
  const { t, errorMessage } = useText();
  const [importing, setImporting] = createSignal(false);

  async function run(): Promise<void> {
    setImporting(true);
    try {
      await props.onImport();
    } catch (error) {
      toast.error(errorMessage(error, t("agentTeam.import.failed")), {
        report: { operation: "agent", source: "system", cause_code: classifyFailure(error) },
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="agent-template-backdrop">
          <Dialog.Content as="section" class="agent-template-dialog" aria-busy={importing() ? "true" : undefined}>
            <Dialog.Title class="sr-only">
              {t("agentTeam.import.title", { name: props.preview?.name ?? "" })}
            </Dialog.Title>
            <Dialog.Description class="sr-only">{t("agentTeam.import.safety")}</Dialog.Description>
            <div class="agent-template-corner-actions">
              <IconButton label={t("common.close")} variant="ghost" onClick={() => props.onOpenChange(false)}>
                <X />
              </IconButton>
            </div>
            <Show when={props.preview}>
              {(preview) => (
                <>
                  <div class="agent-template-body agent-template-scroll">
                    <Heading as="h2" size="md" class="agent-template-name">
                      {t("agentTeam.import.title", { name: preview().name })}
                    </Heading>
                    <Text>
                      {t("agentTeam.import.summary", {
                        agents: preview().agents,
                        sections: preview().sections.length,
                      })}
                    </Text>
                    <For each={preview().sections}>
                      {(section) => (
                        <div>
                          <Heading as="h3" size="sm">
                            {section.name}
                          </Heading>
                          <Text tone="muted" variant="caption">
                            {section.agents.join(", ")}
                          </Text>
                        </div>
                      )}
                    </For>
                    <Text tone="muted" variant="caption">
                      {t("agentTeam.import.contents", { skills: preview().skills, routines: preview().routines })}
                    </Text>
                    <Show when={preview().renamed > 0}>
                      <Text tone="muted" variant="caption">
                        {t("agentTeam.import.renamed", { count: preview().renamed })}
                      </Text>
                    </Show>
                    <Text tone="muted" variant="caption">
                      {t("agentTeam.import.safety")}
                    </Text>
                  </div>
                  <footer class="agent-template-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={importing()}
                      onClick={() => props.onOpenChange(false)}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button type="button" variant="default" disabled={importing()} onClick={() => void run()}>
                      {importing() ? t("agentTeam.import.pending") : t("agentTeam.import.action")}
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
