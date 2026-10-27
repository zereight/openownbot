### Fixed

- Duplicating an agent now carries its browser session over: an agent-only session stays agent-only, and a named browser profile stays selected, instead of silently falling back to the shared session. A named profile is shared with the duplicate by design; an agent-only session starts fresh under the new agent id.
