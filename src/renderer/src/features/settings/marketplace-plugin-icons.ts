import { LOCAL_ONLY } from "@robot/contracts/local-only";
import type { MarketplacePluginDetail } from "@robot/ui/features/settings/marketplace-plugins";
import { MARKETPLACE_PLUGINS } from "./marketplace-plugin-catalog";

/**
 * Whether an image address is on the network. An `<img>` with such an address asks that site for the
 * file as soon as it is drawn, which tells the site that this computer opened the marketplace.
 */
export function isRemoteImageUrl(url: string | null): boolean {
  return url !== null && /^https?:\/\//iu.test(url);
}

/**
 * The listings without the icons that sit on other sites, while `localOnly` is on. The catalog is a
 * generated file that points at each plugin's own favicon, so the icons are taken out here, where the
 * screens read it; a listing with no icon shows the plugin mark, as one whose icon fails to load does.
 */
export function withoutRemoteIcons(
  plugins: readonly MarketplacePluginDetail[],
  localOnly: boolean,
): MarketplacePluginDetail[] {
  if (!localOnly) return [...plugins];
  return plugins.map((plugin) => ({
    ...plugin,
    iconUrl: isRemoteImageUrl(plugin.iconUrl) ? null : plugin.iconUrl,
    apps: plugin.apps.map((app) => ({ ...app, iconUrl: isRemoteImageUrl(app.iconUrl) ? null : app.iconUrl })),
  }));
}

/** What the screens list. */
export const DISPLAYED_MARKETPLACE_PLUGINS: MarketplacePluginDetail[] = withoutRemoteIcons(
  MARKETPLACE_PLUGINS,
  LOCAL_ONLY,
);
