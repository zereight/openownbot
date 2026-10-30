### Changed

- Internal: callers reach the routine timer, agent waits, and conversation search and read markers through `AgentService.routineTimer`, `AgentService.waits` and `AgentService.conversations` instead of 12 forwarding methods. Users see no change.
