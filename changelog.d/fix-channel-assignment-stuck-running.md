### Fixed

- Settle a channel assignment when its turn ends but the turn's thread no longer maps to the
  channel. Before, the assignment stayed active and every chat kept reading "working in" that
  channel until the app restarted.
