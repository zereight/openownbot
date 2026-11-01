import type { JSX } from "@solidjs/web";
import { cx } from "./utils";

/** Up to two letters of a server name: the first letter of each of its first two words. */
export function serverInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[1]] : [words[0] ?? ""];
  return letters
    .map((word) => Array.from(word ?? "")[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

export interface ServerMonogramProps {
  name: string;
  class?: JSX.HTMLAttributes<HTMLSpanElement>["class"];
}

/**
 * The mark of a server without a logo: the initials of its name on a plain tile, as a chat server app
 * shows a server with no icon. The name next to it is the label, so the mark is hidden from readers.
 */
export function ServerMonogram(props: ServerMonogramProps): JSX.Element {
  return (
    <span class={cx("ui-server-monogram", props.class)} aria-hidden="true">
      {serverInitials(props.name)}
    </span>
  );
}
