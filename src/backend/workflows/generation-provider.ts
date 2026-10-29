import type { AgentProvider } from "../agent-client";
import { DEFAULT_AGENT_PROVIDER } from "../agent-store";

/** Providers that cannot answer a prompt with no tools and no thread, which is how a workflow asks. */
const CANNOT_GENERATE: readonly AgentProvider[] = ["muse"];

/**
 * The provider that answers a model step or a condition. A step that names one gets it, so a wrong
 * choice fails where the user made it. A step that names none takes the starting choice, and then
 * the preferred provider, unless that one cannot generate: Muse as the default failed every
 * condition in 46 ms, and no retry can fix that.
 */
export function workflowGenerationProvider(
  named: AgentProvider | null,
  starting: AgentProvider | undefined,
  preferred: AgentProvider,
): AgentProvider {
  if (named) return named;
  return (
    [starting, preferred].find((provider) => provider && !CANNOT_GENERATE.includes(provider)) ?? DEFAULT_AGENT_PROVIDER
  );
}
