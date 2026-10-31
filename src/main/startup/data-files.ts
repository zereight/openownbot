// The names of the files that main keeps in the ROBot data folder (`app.getPath("userData")`).

export const SETUP_FILE = "setup.json";
export const APPROVAL_AUTOMATION_FILE = "approval-automation.json";
export const ROUTINE_FEED_FILE = "routine-feed.json";
export const LANGUAGE_PREFERENCE_FILE = "language-preference.json";
export const LOGO_COLOR_PREFERENCE_FILE = "logo-color-preference.json";
export const APPEARANCE_PREFERENCE_FILE = "appearance-preference.json";
export const INTERFACE_SIZE_PREFERENCE_FILE = "interface-size-preference.json";
export const UPDATE_PREFERENCE_FILE = "update-preference.json";
export const NOTIFICATION_PREFERENCE_FILE = "notification-preference.json";
export const PUSH_NOTIFICATION_FILE = "push-notifications.json";
export const BUSY_MESSAGE_MODE_PREFERENCE_FILE = "busy-message-mode.json";
export const PROVIDER_CLI_APP_VERSION_FILE = "provider-cli-app-version.json";
export const AGENT_DEFAULTS_PREFERENCE_FILE = "agent-defaults.json";
export const AGENT_MEMORY_LIMIT_PREFERENCE_FILE = "agent-memory-limit.json";
export const MEMORY_REVIEW_PREFERENCE_FILE = "memory-review.json";
export const SERVER_TIMEZONE_PREFERENCE_FILE = "server-timezone.json";
export const PROMPT_CACHE_TTL_PREFERENCE_FILE = "prompt-cache-ttl.json";
export const CLAUDE_ENVIRONMENT_PREFERENCE_FILE = "claude-environment.json";
export const REMOTE_SESSION_REUSE_PREFERENCE_FILE = "remote-session-reuse-preference.json";
export const EXTERNAL_LINK_PREFERENCE_FILE = "external-link-preference.json";
export const REMOTE_NETWORK_ROUTE_PREFERENCE_FILE = "remote-network-route.json";
export const APP_BEHAVIOR_PREFERENCE_FILE = "app-behavior-preference.json";
export const DYNAMIC_ISLAND_PREFERENCE_FILE = "dynamic-island-preference.json";
export const BROWSER_STATE_FILE = "browser-state.json";
export const SIDEBAR_LAYOUT_FILE = "sidebar-layout.json";
/** One host per account. */
export const TEAM_FILE = "team-server.json";
export const REMOTE_SERVERS_FILE = "remote-servers.json";
export const CENTRAL_AUTH_FILE = "central-auth.bin";
export const REMOTE_SESSIONS_FILE = "remote-sessions.bin";
export const REMOTE_DESKTOP_RUNTIME_SECRET_FILE = "remote-desktop-runtime.json";
export const CUSTOM_PROVIDERS_FILE = "custom-providers.json";
export const PROVIDER_CREDENTIAL_FILE = "provider-credentials.json";
export const MESSAGING_CREDENTIAL_FILE = "messaging-credentials.json";
export const INGRESS_QUEUE_KEY_FILE = "ingress-queue-key.json";
/** The MCP sign-ins. Separate from the keys above: a key is typed by the user, a token is not. */
export const MCP_OAUTH_FILE = "mcp-oauth.json";
export const MCP_OAUTH_PROXY_FILE = "mcp-oauth-proxy.json";
/** The one GitHub sign-in of this computer, with the same cipher as the MCP sign-ins. */
export const GITHUB_CONNECTOR_FILE = "github-connector.json";
/** The 1Password service account token of this computer, with the same cipher. */
export const ONEPASSWORD_CONNECTOR_FILE = "onepassword-connector.json";
/** The Bitwarden API key and master password of a host connection (`bitwarden-connector-v1`), with the same cipher. */
export const BITWARDEN_CONNECTOR_FILE = "bitwarden-connector.json";
/** The logins, payment cards and contact info of the Vault in Server settings, with the same cipher. */
export const VAULT_FILE = "vault.json";
/** Which agent each imported Hermes profile made, so a second import updates that agent. */
export const HERMES_IMPORT_LINKS_FILE = "hermes-imports.json";
