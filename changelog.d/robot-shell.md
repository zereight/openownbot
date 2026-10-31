### Added

- Internal: the shared parts of the new ROBot window in `@robot/ui/features/shell`: the server rail, the list of channels and agents, and the member panel, which shows what each agent does now and answers an approval in its row. The app does not use them yet.

### Fixed

- Internal: Storybook stories that show a conversation no longer stop with "Cannot read properties of undefined". A re-render took the mocked bridge away from the next view.
