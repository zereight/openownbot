import { AgentAvatar } from "../agents/AgentAvatar";
import type { ShellAgentIdentity, ShellAgentState } from "./shell-types";

/** An agent's avatar with a dot for its state: green working, orange waiting, red failed. */
export function ShellStatusAvatar(props: { agent: ShellAgentIdentity; state: ShellAgentState; small?: boolean }) {
  return (
    <span class={props.small ? "shell-avatar shell-avatar-small" : "shell-avatar"}>
      <AgentAvatar agent={props.agent} seed={props.agent.avatarSeed} />
      <span class={`shell-status shell-status-${props.state.kind}`} aria-hidden="true" />
    </span>
  );
}
