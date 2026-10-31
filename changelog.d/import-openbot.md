### Added

- `scripts/import-openbot.ts` moves the data of OpenBot 0.50 into ROBot on the same Mac: the database, the agent workspaces, local skills, provider accounts and the settings without secrets. OpenBot data is only read.

### Fixed

- ROBot no longer logs "The roles file did not load" at each start. The roles were removed earlier, and the warning was left behind.
