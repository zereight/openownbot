declare module "@robot/renderer-preview" {
  import type { JSX } from "@solidjs/web";

  export interface OpenOwnBotPlaygroundProps {
    variant?: "default" | "landing";
    theme?: "dark" | "light";
  }

  export function OpenOwnBotPlayground(props: OpenOwnBotPlaygroundProps): JSX.Element;
}
