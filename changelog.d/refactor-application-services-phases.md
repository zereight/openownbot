### Changed

- Internal: 14 startup steps of `createApplicationServices` move to their own functions in `src/main/startup/`, such as `startComputerUse`, `startFlows`, `startRemoteServers`, `startVoice` and `startUpdater`. Each runs at the same point of the startup as before. Users see no change.
