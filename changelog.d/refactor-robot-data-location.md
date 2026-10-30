### Changed

- The app keeps its data in a new place: `ROBot` in the application data folder, and `~/ROBot` for agent
  workspaces. The app does not read, copy or change the data of earlier OpenOwnBot builds
  (`OpenOwnBot`, `OpenBot` and `~/OpenBot`). That data stays on disk, and the app starts empty.
