### Fixed

- Show Stop whenever the agent shows that it is working. Before, a turn that only the queue
  reported left the working line on screen with the send arrow and no way to stop. If no turn is
  known, Stop tells you that this work has no turn to stop from the chat.

### Added

- Show a channel as stopped in the sidebar when it has paused tasks that wait for you, instead of
  leaving it as working. Before, a task that stopped after a restart could still read as working in
  the list while the chat asked you to continue or reassign it.
