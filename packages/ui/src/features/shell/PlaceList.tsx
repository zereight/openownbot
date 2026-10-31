import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";
import { Button } from "../../button";
import { Hash, Settings } from "../../icons";
import { useText } from "../../text";
import { ShellStatusAvatar } from "./ShellStatusAvatar";
import type { ShellPlace, ShellPlaceKey } from "./shell-types";

/** The channels and the agents of one server, with the user's row and Settings at the bottom. */
export function PlaceList(props: {
  serverName: string;
  places: readonly ShellPlace[];
  /** A channel and an agent can have the same id, so a place is its kind and its id. */
  selected: ShellPlaceKey | null;
  onSelect: (place: ShellPlaceKey) => void;
  /** The user's avatar and name. */
  you: JSX.Element;
  onSettings: () => void;
}) {
  const { t } = useText();
  const row = (place: ShellPlace) => (
    <Button
      variant="ghost"
      class="shell-place"
      aria-current={props.selected?.kind === place.kind && props.selected.id === place.id ? "page" : undefined}
      onClick={() => props.onSelect({ kind: place.kind, id: place.id })}
    >
      <Show
        when={place.kind === "agent" ? place : null}
        fallback={<Hash class="shell-place-icon" aria-hidden="true" />}
      >
        {(agent) => <ShellStatusAvatar agent={agent().agent} state={agent().state} small />}
      </Show>
      <span class="shell-place-name">{place.kind === "agent" ? place.agent.name : place.name}</span>
      <Show when={place.unread > 0}>
        <span class="shell-unread" title={t("shell.list.unread", { count: place.unread })}>
          {place.unread}
        </span>
      </Show>
    </Button>
  );
  return (
    <nav class="shell-list" aria-label={t("shell.list.label")}>
      <header class="shell-list-header">{props.serverName}</header>
      <div class="shell-list-scroll">
        <h2 class="shell-section">{t("shell.list.channels")}</h2>
        <For each={props.places.filter((place) => place.kind === "channel")}>{row}</For>
        <h2 class="shell-section">{t("shell.list.agents")}</h2>
        <For each={props.places.filter((place) => place.kind === "agent")}>{row}</For>
      </div>
      <footer class="shell-you">
        <div class="shell-you-slot">{props.you}</div>
        <Button
          variant="ghost"
          class="shell-icon-button"
          aria-label={t("shell.list.settings")}
          title={t("shell.list.settings")}
          onClick={() => props.onSettings()}
        >
          <Settings aria-hidden="true" />
        </Button>
      </footer>
    </nav>
  );
}
