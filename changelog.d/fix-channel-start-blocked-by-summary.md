### Fixed

- A channel assignment no longer fails to start with "Profile generation timed out" when the older
  messages of the channel need a summary. Before, a lead set to the highest reasoning effort could
  take longer than two minutes to write the summary, so the assigned member never started and every
  later assignment in the channel failed the same way. The summary now uses the lowest reasoning
  effort, and a summary that still cannot be written no longer blocks the start.
