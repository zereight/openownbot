import type { ChannelMember, ChannelTask } from "@robot/contracts/ipc";
import { Button, buttonVariants, ConfirmDialog, DropdownMenu } from "@robot/ui";
import { createSignal, For, Show } from "solid-js";
import { useText } from "../../text";

export function ChannelStoppedTasks(props: {
  tasks: Pick<ChannelTask, "id" | "ownerAgentId" | "error">[];
  members: Pick<ChannelMember, "agentId">[];
  name: (agentId: string | null) => string;
  onResume: (taskId: string, recipientAgentId: string | null) => Promise<boolean>;
  onCancel: (taskId: string) => Promise<boolean>;
}) {
  const { t, sourceText } = useText();
  const [cancelling, setCancelling] = createSignal<string | null>(null);
  async function confirmCancel(): Promise<void> {
    const taskId = cancelling();
    if (taskId === null) return;
    await props.onCancel(taskId);
    setCancelling(null);
  }
  return (
    <>
      <Show when={props.tasks.length}>
        <div class="channel-paused-tasks">
          <For each={props.tasks}>
            {(task) => (
              <section
                class="channel-paused-task"
                aria-label={t("channel.stoppedTask.label", { name: props.name(task.ownerAgentId) })}
              >
                <p class="channel-paused-task-reason">
                  {task.error
                    ? sourceText(task.error)
                    : t("channel.stoppedTask.label", { name: props.name(task.ownerAgentId) })}
                </p>
                <div class="channel-paused-task-actions">
                  <Button size="xs" onClick={() => void props.onResume(task.id, null)}>
                    {t("common.continue")}
                  </Button>
                  <DropdownMenu.Root placement="top-start">
                    <DropdownMenu.Trigger
                      class={buttonVariants({ variant: "ghost", size: "xs" })}
                      aria-label={t("channel.stoppedTask.reassignLabel", { name: props.name(task.ownerAgentId) })}
                    >
                      {t("channel.stoppedTask.reassign")}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content>
                        <For each={props.members.filter((member) => member.agentId !== task.ownerAgentId)}>
                          {(member) => (
                            <DropdownMenu.Item onSelect={() => void props.onResume(task.id, member.agentId)}>
                              {props.name(member.agentId)}
                            </DropdownMenu.Item>
                          )}
                        </For>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={t("channel.stoppedTask.cancelLabel", { name: props.name(task.ownerAgentId) })}
                    onClick={() => setCancelling(task.id)}
                  >
                    {t("channel.stoppedTask.cancel")}
                  </Button>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>
      <ConfirmDialog
        open={cancelling() !== null}
        onCancel={() => setCancelling(null)}
        onConfirm={confirmCancel}
        tone="destructive"
        title={t("channel.stoppedTask.cancelTitle")}
        description={t("channel.stoppedTask.cancelDescription")}
        confirmLabel={t("channel.stoppedTask.cancelConfirm")}
        cancelLabel={t("common.back")}
      />
    </>
  );
}
