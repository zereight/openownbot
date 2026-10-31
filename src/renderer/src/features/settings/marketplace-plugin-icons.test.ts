import type { MarketplacePluginDetail } from "@robot/ui/features/settings/marketplace-plugins";
import { describe, expect, it } from "vitest";
import { isRemoteImageUrl, withoutRemoteIcons } from "./marketplace-plugin-icons";

const plugin = (iconUrl: string | null, appIcon: string | null): MarketplacePluginDetail => ({
  id: "p",
  slug: "p",
  name: "P",
  tagline: "",
  description: "",
  category: "productivity",
  creatorName: "",
  version: "1.0.0",
  iconUrl,
  apps: [
    {
      id: "a",
      name: "A",
      description: "",
      iconUrl: appIcon,
      server: { name: "p", transport: "http", url: "https://example.com/mcp" },
    },
  ],
  prompts: [],
  skills: [],
  websiteUrl: null,
  privacyPolicyUrl: null,
  termsUrl: null,
  shareUrl: "",
  installs: 0,
  featured: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("isRemoteImageUrl", () => {
  it("is true for an address on the network and false for what stays on this computer", () => {
    expect(isRemoteImageUrl("https://linear.app/favicon.ico")).toBe(true);
    expect(isRemoteImageUrl("HTTP://example.com/a.png")).toBe(true);
    expect(isRemoteImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isRemoteImageUrl("blob:abc")).toBe(false);
    expect(isRemoteImageUrl("robot-server-logo://x")).toBe(false);
    expect(isRemoteImageUrl("/icons/a.svg")).toBe(false);
    expect(isRemoteImageUrl(null)).toBe(false);
  });
});

describe("withoutRemoteIcons", () => {
  const remote = plugin("https://a.example/favicon.ico", "https://b.example/favicon.ico");

  it("removes the icons of the listing and of each app while local-only is on", () => {
    const [result] = withoutRemoteIcons([remote], true);
    expect(result?.iconUrl).toBeNull();
    expect(result?.apps[0]?.iconUrl).toBeNull();
  });

  it("keeps everything else of the listing", () => {
    const [result] = withoutRemoteIcons([remote], true);
    expect(result).toEqual({ ...remote, iconUrl: null, apps: [{ ...remote.apps[0], iconUrl: null }] });
  });

  it("keeps an icon that is not on the network", () => {
    const local = plugin("data:image/png;base64,AAAA", null);
    expect(withoutRemoteIcons([local], true)).toEqual([local]);
  });

  it("returns the listings as they are while local-only is off", () => {
    expect(withoutRemoteIcons([remote], false)).toEqual([remote]);
  });

  it("does not change the listings it was given", () => {
    withoutRemoteIcons([remote], true);
    expect(remote.iconUrl).toBe("https://a.example/favicon.ico");
  });
});
