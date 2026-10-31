import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

/**
 * The four columns of the ROBot window, darkest to lightest: the server rail, the list of channels
 * and agents, the chat, and the member panel when it is open. Each column is a slot; the frame owns
 * only the layout.
 */
export function ShellFrame(props: { rail: JSX.Element; list: JSX.Element; side?: JSX.Element; children: JSX.Element }) {
  return (
    <div class="shell-frame">
      {props.rail}
      {props.list}
      <div class="shell-chat">{props.children}</div>
      <Show when={props.side}>{props.side}</Show>
    </div>
  );
}
