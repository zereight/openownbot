import { For } from "solid-js";
import { Button } from "../../button";
import { MessageSquareText } from "../../icons";
import { useText } from "../../text";
import { sidebarMessageTime } from "../sidebar/sidebar-filtering";

/** One part of a channel's work that another agent does, with the replies it has so far. */
export interface ThreadChipModel {
  taskId: string;
  /** The agent that does the part, by name. */
  name: string;
  label: string;
  replies: number;
  latestAt: string;
}

/**
 * The parts of the work that a message gave to other agents, as chips under it, as a chat server
 * shows the threads of a message. A chip leads to the newest reply of its part.
 */
export function ThreadChips(props: { chips: readonly ThreadChipModel[]; onOpen: (taskId: string) => void }) {
  const { t, format } = useText();
  return (
    <div class="thread-chips">
      <For each={props.chips}>
        {(chip) => (
          <Button variant="ghost" size="sm" type="button" class="thread-chip" onClick={() => props.onOpen(chip.taskId)}>
            <MessageSquareText aria-hidden="true" />
            <span class="thread-chip-label">{chip.label || chip.name}</span>
            <span class="thread-chip-meta">
              {t("shell.thread.replies", { count: chip.replies })} · {sidebarMessageTime(chip.latestAt, format)}
            </span>
            <span class="sr-only">{t("shell.thread.open", { name: chip.name })}</span>
          </Button>
        )}
      </For>
    </div>
  );
}
