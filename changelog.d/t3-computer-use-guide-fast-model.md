### Added

- Computer Use now tells you what to try when "Try again" does not fix it: quit OpenOwnBot completely,
  open it again, and if the message stays, reinstall the latest version. The text is in all 13 languages.
- A fast decision model can try the first steps of Computer Use before the agent's own model. It reads
  the names of the controls in one window, then presses, types or scrolls. When it is unsure or fails,
  the agent's model continues. Turn it on in Settings › Agents › Decision model. It is off by default,
  and each use asks for your approval.
- The decision model can be a server on this computer, such as `laya-serve`. Settings shows the install
  and start commands and the default address `http://127.0.0.1:8000`. Only addresses on this computer are
  accepted.

### Changed

- The decision model setting now also lists the local server and the Computer Use switch. Your saved
  choice stays as it was.
