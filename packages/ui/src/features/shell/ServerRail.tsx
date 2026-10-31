import { For } from "solid-js";
import { Button } from "../../button";
import { Plus } from "../../icons";
import { useText } from "../../text";
import type { ShellServer } from "./shell-types";

/** Up to two letters of a server name: the first letter of each of its first two words. */
export function serverInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[1]] : [words[0] ?? ""];
  return letters
    .map((word) => Array.from(word ?? "")[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

/** The column of server icons. The selected server is a rounded square, as in Discord. */
export function ServerRail(props: {
  servers: readonly ShellServer[];
  selectedId: string;
  onSelect: (serverId: string) => void;
  onAdd: () => void;
}) {
  const { t } = useText();
  return (
    <nav class="shell-rail" aria-label={t("shell.rail.label")}>
      <For each={props.servers}>
        {(server) => (
          <Button
            variant="ghost"
            class="shell-server"
            aria-pressed={props.selectedId === server.id ? "true" : "false"}
            title={server.name}
            onClick={() => props.onSelect(server.id)}
          >
            <span aria-hidden="true">{serverInitials(server.name)}</span>
            <span class="sr-only">{server.name}</span>
          </Button>
        )}
      </For>
      <Button
        variant="ghost"
        class="shell-server shell-server-add"
        aria-label={t("shell.rail.add")}
        title={t("shell.rail.add")}
        onClick={() => props.onAdd()}
      >
        <Plus aria-hidden="true" />
      </Button>
    </nav>
  );
}
