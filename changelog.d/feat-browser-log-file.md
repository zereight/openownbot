### Added

- Keep a browser log in `logs/browser/browser.log` in the app data folder. It records a failed browser
  tool call of an agent, each Stop request for a page load and what it did, and the warnings of the
  browser. Before, a browser warning left no line in `logs/`, so a support report could not show the
  cause.
