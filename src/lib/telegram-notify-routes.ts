// Admin-controlled Telegram notification routing: which notice goes to which
// group/channel and whether it also reaches every bot user's DM.
// Until the admin saves the matrix (`notify_routes`), legacy routing stays.

export const NOTIFY_KINDS = [
  { key: "new_product", label: "New product" },
  { key: "restock", label: "New stock / Stock in" },
  { key: "still_available", label: "Still available" },
  { key: "low_stock", label: "Almost gone (low stock)" },
  { key: "sold_out", label: "Stock out" },
  { key: "price_change", label: "Price change" },
  { key: "flash_sale", label: "Flash sale" },
  { key: "product_removed", label: "Product removed" },
  { key: "product_list", label: "Product list (all / category / selected / new)" },
  { key: "bulk_discount", label: "Bulk price alert" },
  { key: "admin_broadcast", label: "Admin broadcast (website admin)" },
  { key: "live_purchase", label: "Live purchase / delivery" },
  { key: "live_payment", label: "Payment / top-up" },
  { key: "live_member", label: "New member" },
  { key: "free_claim", label: "Free claim" },
  { key: "supplier_notice", label: "Supplier notice" },
] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number]["key"];

export const NOTIFY_GROUP_DESTS = [
  { key: "general", label: "General Chat Group", chatKey: "notify_chat_general", linkKey: "community_group_link" },
  { key: "updates", label: "Store Updates", chatKey: "notify_chat_updates", linkKey: "community_updates_link" },
  { key: "channel", label: "Official Channel", chatKey: "notify_chat_channel", linkKey: "community_channel_link" },
] as const;
export type NotifyDest = "general" | "updates" | "channel" | "dm";
export const NOTIFY_DESTS: NotifyDest[] = ["general", "updates", "channel", "dm"];

export type NotifyMatrix = Record<NotifyDest, Partial<Record<NotifyKind, boolean>>>;

/** Chat ID for a group destination, falling back to the existing alert groups. */
export function notifyChatId(s: Record<string, string>, dest: Exclude<NotifyDest, "dm">): string {
  const own = (s[`notify_chat_${dest}`] ?? "").trim();
  if (own) return own;
  if (dest === "general") return (s["announce_chat_id"] ?? "").trim();
  if (dest === "updates") return (s["live_channel_id"] ?? "").trim();
  return "";
}

export function parseNotifyMatrix(raw: string | undefined | null): NotifyMatrix | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const out = {} as NotifyMatrix;
    for (const d of NOTIFY_DESTS) {
      out[d] = {};
      const row = v[d] && typeof v[d] === "object" ? v[d] : {};
      for (const k of NOTIFY_KINDS) out[d][k.key] = row[k.key] === true;
    }
    return out;
  } catch {
    return null;
  }
}

/** Default switches shown before the first save: everything on. */
export function defaultNotifyMatrix(): NotifyMatrix {
  const out = {} as NotifyMatrix;
  for (const d of NOTIFY_DESTS) {
    out[d] = {};
    for (const k of NOTIFY_KINDS) out[d][k.key] = true;
  }
  return out;
}

export type NotifyRoute = { configured: false } | { configured: true; groups: string[]; dm: boolean };

export function notifyRoute(s: Record<string, string>, kind: NotifyKind): NotifyRoute {
  const m = parseNotifyMatrix(s["notify_routes"]);
  if (!m) return { configured: false };
  const groups = new Set<string>();
  for (const d of NOTIFY_GROUP_DESTS) {
    if (!m[d.key][kind]) continue;
    const id = notifyChatId(s, d.key);
    if (id) groups.add(id);
  }
  return { configured: true, groups: [...groups], dm: Boolean(m.dm[kind]) };
}

/** Stock-card queue kinds → admin switch. */
export function stockKindToNotify(kind: string): NotifyKind | null {
  switch (kind) {
    case "new": return "new_product";
    case "restock": return "restock";
    case "still": return "still_available";
    case "low": return "low_stock";
    case "out": return "sold_out";
    case "price": return "price_change";
    case "flash": case "flash_end": return "flash_sale";
    case "removed": return "product_removed";
    default: return null;
  }
}
