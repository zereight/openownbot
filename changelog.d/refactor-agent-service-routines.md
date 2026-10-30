### Changed

- Internal: callers reach agent routines, channel memories and channel routines through `AgentService.routines`, `AgentService.channels` and `AgentService.channelRoutines` instead of 17 forwarding methods. Users see no change.
