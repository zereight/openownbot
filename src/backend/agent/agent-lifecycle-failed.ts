import { Effect, Schema } from "effect";

/** A step of the agent service failed; `operation` names it. */
export class AgentLifecycleFailed extends Schema.TaggedError<AgentLifecycleFailed>()("AgentLifecycleFailed", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/** Runs one synchronous step of the agent service; a throw becomes `AgentLifecycleFailed`. */
export function lifecycleStep<A>(operation: string, run: () => A): Effect.Effect<A, AgentLifecycleFailed> {
  return Effect.try({ try: run, catch: (cause) => new AgentLifecycleFailed({ operation, cause }) });
}
