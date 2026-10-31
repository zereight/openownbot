import { isAgentModel, isAgentProvider } from "@robot/contracts/ipc";
import {
  PROVIDER_DEFAULT_CAPABILITY,
  PROVIDER_DEFAULT_ROUTES,
} from "@robot/contracts/team-protocol/provider-default-v1";
import { sourceText } from "@robot/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamApiAdmin } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireAdmin } from "./request-helpers";

/** The provider that a new agent of this server starts on, read and set from a joined server. Frozen by `provider-default-v1`. */
export async function routeProviderDefault(
  context: TeamApiRequestContext,
  admin: TeamApiAdmin | undefined,
): Promise<RouteOutcome> {
  const { method, url, capabilities, member, request, json } = context;
  if (
    method !== "POST" ||
    (url.pathname !== PROVIDER_DEFAULT_ROUTES.settings && url.pathname !== PROVIDER_DEFAULT_ROUTES.update)
  )
    return "unmatched";
  const setting = admin?.defaultProvider;
  if (!setting || !capabilities.has(PROVIDER_DEFAULT_CAPABILITY))
    throw new HttpError(400, sourceText("error.team.providerDefaultUnsupported"));
  requireAdmin(member);
  const body = await readJson(request);
  if (url.pathname === PROVIDER_DEFAULT_ROUTES.settings) return json(200, await runCauseEffect(setting.get()));
  if (!isAgentProvider(body.provider)) throw new HttpError(400, "Unknown provider.");
  if (body.model !== null && !isAgentModel(body.model)) throw new HttpError(400, "Unknown model.");
  return json(200, await runCauseEffect(setting.set({ preferredProvider: body.provider, preferredModel: body.model })));
}
