### Changed

- A side thread is named by its thread id only. The database drops the `legacy_task_id` column and its schema version is now 2. A development database of version 1 does not open; delete it.
