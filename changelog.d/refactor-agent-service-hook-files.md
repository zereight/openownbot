### Changed

- Internal: the six hook objects of `AgentService` live in `src/backend/agent/hooks/` and reach the service through `AgentService.parts`. `AgentLifecycleFailed` moves to `src/backend/agent/agent-lifecycle-failed.ts`. Users see no change.
