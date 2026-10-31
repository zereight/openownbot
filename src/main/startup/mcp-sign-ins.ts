import { createOpenOwnBotLogger, toLogValue } from "@robot/logging";
import { Effect } from "effect";
import { McpOAuth } from "../../backend/mcp-oauth-provider";
import { SignInRelayClient } from "../account/sign-in-relay-client";
import type { McpOAuthProxySettingsFile } from "../connectors/mcp-oauth-proxy-store";
import {
  MCP_OAUTH_REDIRECT_PATH,
  MCP_OAUTH_REDIRECT_PORT,
  startMcpOAuthRedirectServer,
} from "../connectors/mcp-oauth-redirect-server";
import type { McpOAuthStore } from "../connectors/mcp-oauth-store";
import type { LanguageService } from "../settings/language-service";
import { MCP_OAUTH_REDIRECT_URL } from "../windows/deep-link-router";
import { showMainWindow } from "../windows/main-window";
import type { ApplicationServiceContext } from "./application-service-types";
import { TEARDOWN_ORDER } from "./teardown-order";

const logger = createOpenOwnBotLogger("application-services");
/** The MCP sign-in relay, its local redirect server and the token refresh. */
export async function startMcpSignIns({
  language,
  mcpOAuthProxySettings,
  mcpOAuthStore,
  openLink,
  teardown,
  windows,
}: {
  language: LanguageService;
  mcpOAuthProxySettings: McpOAuthProxySettingsFile;
  mcpOAuthStore: McpOAuthStore;
  openLink: (url: string) => Promise<void>;
  teardown: ApplicationServiceContext["teardown"];
  windows: ApplicationServiceContext["windows"];
}) {
  const mcpOAuthProxyLoadError = await Effect.runPromise(mcpOAuthProxySettings.load());
  if (mcpOAuthProxyLoadError) {
    logger.warn(
      `ROBot could not read the MCP sign-in proxy file (${mcpOAuthProxyLoadError.name}). A new port is used.`,
    );
  }
  /*
   * Where a returning grant lands. The loopback listener is the address RFC 8252 gives a native
   * app and the only one some authorization servers accept - Canva refuses `openownbot://mcp-auth`
   * on its own authorization page, where ROBot cannot see the failure or explain it.
   *
   * A port that cannot be bound is not fatal: the deep link is still registered with the
   * operating system, and the servers that accept it keep working. It is logged because it
   * decides which address every later sign-in registers, and a sign-in that a server then
   * refuses is otherwise a mystery in a support thread.
   */
  // The listener is bound before the authority that answers it exists, and a request can arrive
  // in between - a browser tab left open on a previous run reaches this port on its own. It is
  // held rather than closed over, so that request is refused instead of raising in the listener.
  let mcpOAuthAuthority: McpOAuth | null = null;
  // A joined server's sign-in can send its callback to this same port: the host's own listener
  // uses the same port number. A `state` that no local sign-in started goes to the relay.
  const signInRelayClient = new SignInRelayClient({
    openExternal: openLink,
    language,
    ownListener: () =>
      mcpOAuthRedirect
        ? { port: Number(new URL(mcpOAuthRedirect.redirectUrl).port), path: MCP_OAUTH_REDIRECT_PATH }
        : null,
  });
  performance.mark("openownbot:services.mcp-sign-in-file");
  const mcpOAuthRedirect = await startMcpOAuthRedirectServer({
    language,
    preferredPort: MCP_OAUTH_REDIRECT_PORT,
    deliver: (state, code, query) => {
      const elsewhere = mcpOAuthAuthority?.openedElsewhere(state) ?? false;
      if (!mcpOAuthAuthority?.receiveAuthorizationCode(state, code))
        return signInRelayClient.deliver(state, query) ? "relayed" : false;
      if (elsewhere) return true;
      const current = windows.getMainWindow();
      if (current && !current.isDestroyed()) showMainWindow(current);
      return true;
    },
    relayRefusal: (state, query) => {
      signInRelayClient.deliver(state, query);
    },
  }).catch((error: unknown) => {
    logger.warn(
      "ROBot could not listen for MCP sign-ins on this machine, so the openownbot:// link is used instead. Servers that refuse it cannot be signed in to:",
      toLogValue(error),
    );
    return null;
  });
  if (mcpOAuthRedirect) {
    teardown.push(TEARDOWN_ORDER.mcpOAuthRedirect, "the MCP sign-in listener", () => mcpOAuthRedirect.close());
  }
  const mcpOAuth = new McpOAuth({
    storage: mcpOAuthStore,
    openExternal: openLink,
    redirectUrl: mcpOAuthRedirect?.redirectUrl ?? MCP_OAUTH_REDIRECT_URL,
    logger: createOpenOwnBotLogger("mcp-oauth"),
  });
  mcpOAuthAuthority = mcpOAuth;
  teardown.push(TEARDOWN_ORDER.mcpOAuth, "MCP token refresh", () => Effect.runPromise(mcpOAuth.close()));
  return { mcpOAuth, signInRelayClient };
}
