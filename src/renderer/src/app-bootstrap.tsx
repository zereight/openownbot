import { flush, onSettled } from "solid-js";
import { appPort } from "./app-port";
import { useSettings } from "./features/settings/settings-context";

/**
 * The deep links, and nothing else.
 *
 * This used to hold the first per-server load and the two window listeners as
 * well. Both moved into `server-scope.tsx` when the per-server state became a
 * keyed subtree: the load because first mount and server switch are now the same
 * mount, and the listeners because both read scoped state.
 *
 * What is left genuinely belongs above that boundary. A plugin link
 * opens the marketplace on one listing, and installs nothing. An agent link is the same:
 * it opens the install dialog on one template, and installs nothing by itself.
 *
 * The MCP notice below belongs here for the same reason: the MCP list is
 * machine-scoped, the notice is owed once per computer and not once per
 * workspace, and it has to reach a user who never opens the MCP panel.
 */
export function AppBootstrap() {
  const { setPendingAgentTemplateId, setPendingPluginSlug, setSkillsMarketplaceOpen } = useSettings();

  onSettled(() => {
    const receivePluginSlug = (slug: string) => {
      flush(() => {
        setPendingPluginSlug(slug);
        setSkillsMarketplaceOpen(true);
      });
    };
    const unsubscribePlugin = appPort().plugins.onOpenListing((slug) => {
      receivePluginSlug(slug);
    });
    const receiveAgentTemplate = (id: string) => {
      flush(() => setPendingAgentTemplateId(id));
    };
    const unsubscribeAgentTemplate = appPort().agentTemplates.onOpenLink((id) => {
      receiveAgentTemplate(id);
    });
    // Every subscription is in place before any link is asked for, because the first of these
    // requests is what tells main that a window is listening.
    void appPort()
      .plugins.takePendingListing()
      .then((slug) => slug && receivePluginSlug(slug))
      .catch(() => undefined);
    void appPort()
      .agentTemplates.takePendingLink()
      .then((id) => id && receiveAgentTemplate(id))
      .catch(() => undefined);
    return () => {
      unsubscribePlugin();
      unsubscribeAgentTemplate();
    };
  });

  return null;
}
