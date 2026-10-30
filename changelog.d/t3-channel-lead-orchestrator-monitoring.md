### Changed

- A channel lead now checks the channel when all its agents stop. It tells an agent to finish work
  that stopped early, or asks you for a decision that only you can make. It looks at most 3 times
  after each message that you send. Before, the lead only chose the owner of a new request.
