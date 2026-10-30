### Changed

- Internal: the `AgentService` constructor names the callbacks it gives the provider runtime, drain scheduler, turn lifecycle, tool router, usage limit gate and channel service in six private methods. The constructor goes from 1,057 to 630 lines. Users see no change.
