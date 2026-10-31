/**
 * Where each service stops, as a position in the shutdown sequence rather than a position in the
 * construction sequence. The gaps leave room to insert one without renumbering.
 */
export const TEARDOWN_ORDER = {
  // First, so a process that the teardown ends does not count as a crash.
  resourceMonitor: 9,
  updater: 10,
  idleRestart: 11,
  hostUpdateCoordinator: 12,
  requestedUpdate: 13,
  hostedServerStartRetry: 14,
  launchPublishRetry: 14.5,
  hostedServerActivity: 15,
  serverMemory: 16,
  serverMode: 17,
  computerUseHighlight: 18,
  computerUsePermissionHelp: 19,
  dynamicIsland: 20,
  // Before the browser, so no sign-in opens a tab while it stops.
  providerAccountsHost: 27,
  providerHostSignIns: 28,
  mcpHostSignIns: 29,
  browser: 30,
  browserPictureInPicture: 40,
  localSignIn: 41,
  browserDock: 42,
  browserView: 45,
  providerDetection: 48,
  providerRuntimes: 50,
  cuaDriver: 55,
  remoteServers: 60,
  voice: 70,
  speech: 71,
  remoteDesktop: 80,
  // Before messaging, so no routine answer starts a post while the connections stop.
  routineResults: 84,
  // Before the host and the service: no new external message arrives while they stop.
  messaging: 85,
  hostEvents: 85.5,
  // After the connections that hold it.
  signalIngress: 86,
  host: 90,
  teamWebRtcBridge: 100,
  // Before the agent service, so no handoff is sent to an agent while the service stops.
  routineFlows: 103,
  // Before the agent service, so no workflow step is sent to an agent while the service stops.
  workflows: 103.5,
  // Before the agent service, so no calendar read finds it stopping.
  routineFeed: 104,
  mcpOAuthRedirect: 105,
  // Before the agent service. It holds no file an agent reads; only a CLI run that waits is stopped.
  onePasswordConnector: 106,
  bitwardenConnector: 106.5,
  // Before the agent service, so no agent is handed a token file that is being removed.
  githubConnector: 107,
  // Before the agent service, so no script starts a run while the service stops.
  automation: 108,
  storageUsage: 109,
  service: 110,
  mcpOAuth: 111,
  // After all account consumers have stopped.
  centralAuth: 115,
  // After the service, so the turns that end while the services stop are still written.
  trace: 120,
  // After the service, so the lines its providers write while they stop are kept.
  providerLog: 121,
  // After the service, so a deletion that fails while the service stops is kept.
  agentLog: 122,
  // After the account, so a session write that fails while it stops is kept.
  accountLog: 123,
  // Last: every step above can still write.
  database: 130,
} as const;
