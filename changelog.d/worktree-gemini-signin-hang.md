### Fixed

- On Windows and macOS, OpenOwnBot now opens the Google sign-in page for Gemini, as it does on Linux.
  Before, the Gemini server opened it itself, and when no page opened, Connect showed no error and
  waited ten minutes.
- When the Gemini process stops answering, OpenOwnBot now ends it and starts a new one. Before, a turn
  could wait with no end, and Gemini worked again only after you restarted it.
