/**
 * One channel in a section. A channel is filed and dragged exactly like an agent, so this shares
 * the agent row's drag wrapper, its `.agent-row` anatomy and its context menu's pin and "Move to"
 * items. A channel is a `#` and its name, as on a chat server; its newest message stays in the
 * accessible label, and running work shows as a dot on the `#`.
 *
 * A channel whose work waits for the user sits in the "Needs you" group, as a waiting agent does.
 * There it does not drag, and it has the same badge, chip and tooltip as the agent row.
 */

import type { ChannelSummary } from "@robot/contracts/ipc";
import { Badge, buttonVariants, ContextMenu } from "@robot/ui";
import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";
import { Hash } from "../../icons";
import { useText } from "../../text";
import { SidebarAgentIndicator, SidebarWaitChip, SidebarWaitTooltip } from "./SidebarAgentIndicator";
import { SidebarChannelContextMenu, SidebarDeletedChannelContextMenu } from "./SidebarChannelContextMenu";
import { sidebarAgentStateLabel } from "./sidebar-filtering";
import { useSidebarScope } from "./sidebar-scope";

/** `waiting` is set by the "Needs you" group, as on `SidebarAgentRow`. */
export function SidebarChannelRow(rowProps: { channel: ChannelSummary; waiting?: boolean }) {
  const {
    dragOffset,
    draggedChatId,
    endChatDragging,
    layoutMutable,
    props,
    sidebarClickIsSuppressed,
    startChatDragging,
  } = useSidebarScope();
  const { t, format } = useText();
  const active = () => props.activeChannelId === rowProps.channel.id;
  const working = () => (rowProps.channel.pausedTasks ?? 0) === 0 && rowProps.channel.activeTasks > 0;
  const channelWait = () => props.channelWaits?.[rowProps.channel.id];
  const wait = () => (rowProps.waiting ? channelWait() : undefined);
  const waitLabel = () => {
    const current = channelWait();
    return current ? `. ${sidebarAgentStateLabel(current, t, format)}` : "";
  };
  const draggable = () => !rowProps.channel.archived && layoutMutable() && !props.compact && !rowProps.waiting;
  const [menuOpen, setMenuOpen] = createSignal(false);
  const title = () => rowProps.channel.title.trim();
  /* Running work is a prefix on the preview line rather than a word beside the name: one line
   * carries both and the row keeps the height every other row in the list has. */
  const preview = () => {
    const text = rowProps.channel.lastMessage?.text ?? t("sidebar.channel.noMessages");
    // Stopped work outranks running work: nothing of it moves until the user acts.
    if ((rowProps.channel.pausedTasks ?? 0) > 0) return t("sidebar.channel.pausedPreview", { preview: text });
    return rowProps.channel.activeTasks > 0 ? t("sidebar.channel.workingPreview", { preview: text }) : text;
  };
  const row = (): JSX.Element => (
    <ContextMenu.Root modal={false} onOpenChange={setMenuOpen}>
      <ContextMenu.Trigger
        as="button"
        type="button"
        class={[
          buttonVariants({ variant: "ghost" }),
          "agent-row channel-row",
          {
            "agent-row-active": active(),
            "agent-row-unread": rowProps.channel.unreadCount > 0,
            "sidebar-agent-row-dragging": draggedChatId() === rowProps.channel.id,
          },
        ]}
        aria-label={`${rowProps.channel.name}${title() ? `, ${title()}` : ""}. ${preview()}${waitLabel()}`}
        aria-pressed={active() ? "true" : "false"}
        data-cuelume-navigate=""
        onClick={(event: MouseEvent) => {
          if (!sidebarClickIsSuppressed(event)) props.onSelectChannel?.(rowProps.channel.id);
        }}
      >
        <span class={["agent-row-avatar channel-row-hash", { "channel-row-working": working() }]}>
          <Hash aria-hidden="true" />
          <Show when={channelWait()}>
            <SidebarAgentIndicator state={channelWait} />
          </Show>
        </span>
        <span class="agent-row-copy">
          <span class="agent-row-heading">
            <span class="agent-row-title">
              <strong>{rowProps.channel.name}</strong>
              <Show when={title()}>
                {(label) => (
                  <Badge class="agent-role-badge" title={label()}>
                    <span>{label()}</span>
                  </Badge>
                )}
              </Show>
            </span>
            <Show
              when={wait()}
              fallback={
                <Show when={rowProps.channel.unreadCount > 0}>
                  <Badge class="agent-row-count" variant="primary-light" aria-hidden="true">
                    {Math.min(rowProps.channel.unreadCount, 99)}
                  </Badge>
                </Show>
              }
            >
              {(current) => <SidebarWaitChip reason={current().reason} />}
            </Show>
          </span>
        </span>
        <Show when={rowProps.channel.unreadCount > 0}>
          <span class="sr-only">{t("sidebar.channel.unread", { count: rowProps.channel.unreadCount })}</span>
        </Show>
      </ContextMenu.Trigger>
      <Show
        when={!rowProps.channel.archived}
        fallback={
          <Show when={props.onRestoreChannel}>
            <SidebarDeletedChannelContextMenu channel={rowProps.channel} />
          </Show>
        }
      >
        <SidebarChannelContextMenu channel={rowProps.channel} pinned={false} />
      </Show>
    </ContextMenu.Root>
  );
  return (
    /* biome-ignore lint/a11y/noStaticElementInteractions: Native drag belongs to the wrapper around the accessible button. */
    <div
      class={[
        "sidebar-agent-item",
        {
          "sidebar-agent-item-dragging": draggedChatId() === rowProps.channel.id,
          "sidebar-drag-shifting": dragOffset(rowProps.channel.id).y !== 0,
        },
      ]}
      style={`--sidebar-drag-y: ${dragOffset(rowProps.channel.id).y}px;`}
      data-chat-id={rowProps.waiting ? undefined : rowProps.channel.id}
      draggable={draggable() ? "true" : "false"}
      onDragStart={(event: DragEvent & { currentTarget: HTMLElement }) => startChatDragging(event, rowProps.channel.id)}
      onDragEnd={endChatDragging}
    >
      <Show when={wait()} fallback={row()}>
        {(current) => (
          <SidebarWaitTooltip wait={current()} menuOpen={menuOpen()}>
            {row()}
          </SidebarWaitTooltip>
        )}
      </Show>
    </div>
  );
}
