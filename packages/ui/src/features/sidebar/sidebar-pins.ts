export type SidebarPinnedItem = Readonly<{
  kind: "agent" | "channel";
  id: string;
}>;

export function sidebarPinnedItemKey(item: SidebarPinnedItem): string {
  return `${item.kind}:${item.id}`;
}

export function normalizeSidebarPinnedItems(value: readonly SidebarPinnedItem[]): SidebarPinnedItem[] {
  const seen = new Set<string>();
  const items: SidebarPinnedItem[] = [];
  for (const candidate of value) {
    const key = sidebarPinnedItemKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: candidate.kind, id: candidate.id });
  }
  return items;
}
