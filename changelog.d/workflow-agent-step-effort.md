### Added

- An agent step in a workflow can use its own reasoning effort, low to max. The step runs one turn with that effort, and the agent keeps its own setting for every other turn. Pick "Agent's own" in the effort menu of the step to follow the setting of the agent again. When the agent's model does not offer the effort, the step runs with the agent's own. An agent that edits a workflow can set the effort of a step too.

### Changed

- The model shown on an agent step in a workflow is read-only. The step has always run with the model of its agent, so the menu that seemed to change it did nothing.
