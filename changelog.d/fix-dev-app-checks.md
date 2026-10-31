### Fixed

- Internal: the dev app E2E scripts that drive the UI switch the app to English while they run and restore the language at the end. `file-preview-e2e` finds the agent row by its name, and `agent-tasks-e2e` gives a fast model a longer task so Stop still finds it running.
