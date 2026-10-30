import { Schema } from "effect";

/** A step of the agent service failed; `operation` names it. */
export class AgentLifecycleFailed extends Schema.TaggedError<AgentLifecycleFailed>()("AgentLifecycleFailed", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
