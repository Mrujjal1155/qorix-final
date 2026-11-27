import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { websiteEmojiId, websiteIconMedia } from "@/lib/website-premium-icons";
import { artworkFor } from "@/lib/premium-artwork.server";

/** Trusted admin saves/scheduled reconciliation only; no product or payment mutation. */
export async function syncProductPremiumIcon(productId: string) {
  const { data: product, error } = await supabaseAdmin.from("products")
    .select("id,telegram_custom_emoji_id,is_active,owner_reseller_id").eq("id", productId).maybeSingle();
  if (error) throw new Error("Could not read product artwork");
  const key = `site_product_icon_${productId}`;
  const emojiId = product?.is_active && !product.owner_reseller_id ? String(product.telegram_custom_emoji_id ?? "").trim() : "";
  const { data: current, error: readError } = await supabaseAdmin.from("bot_settings").select("value").eq("key", key).maybeSingle();
  if (readError) throw new Error("Could not read saved product artwork");
  if (!emojiId) {
    if (current?.value === "") return false;
    const saved = await supabaseAdmin.from("bot_settings").upsert({ key, value: "" }, { onConflict: "key" });
    if (saved.error) throw new Error("Could not reset product artwork");
    return true;
  }
  const valid = websiteEmojiId.safeParse(emojiId);
  if (!valid.success) return false;
  if (current?.value && websiteIconMedia(current.value)?.emojiId === emojiId) return false;
  // Pending/changed IDs suppress obsolete captured artwork, including when download fails.
  const pending = await supabaseAdmin.from("bot_settings").upsert({ key, value: JSON.stringify({ emojiId }) }, { onConflict: "key" });
  if (pending.error) throw new Error("Could not prepare product artwork");
  const value = await artworkFor(emojiId);
  const { data: latest, error: latestError } = await supabaseAdmin.from("products")
    .select("telegram_custom_emoji_id,is_active,owner_reseller_id").eq("id", productId).maybeSingle();
  if (latestError) throw new Error("Could not confirm product artwork");
  if (!latest?.is_active || latest.owner_reseller_id || String(latest.telegram_custom_emoji_id ?? "").trim() !== emojiId) return false;
  // Do not let an older in-flight download overwrite a later icon edit.
  const saved = await supabaseAdmin.from("bot_settings").update({ value }).eq("key", key).eq("value", JSON.stringify({ emojiId }));
  if (saved.error) throw new Error("Could not save product artwork");
  return true;
}

/** Bounded durable scan also catches supplier inserts and historical unmapped products. */
export async function reconcileProductPremiumIcons() {
  const cursorKey = "product_premium_scan_cursor";
  const { data: cursor } = await supabaseAdmin.from("bot_settings").select("value").eq("key", cursorKey).maybeSingle();
  let query = supabaseAdmin.from("products").select("id").not("telegram_custom_emoji_id", "is", null).order("id").limit(8);
  if (cursor?.value) query = query.gt("id", cursor.value);
  const { data: rows, error } = await query;
  if (error) throw new Error("Product artwork scan unavailable");
  let prepared = 0;
  for (const row of rows ?? []) {
    try { if (await syncProductPremiumIcon(row.id)) prepared++; }
    catch { /* Keep pending artwork; retry on the next full scan without blocking other products. */ }
  }
  const last = rows?.at(-1);
  const saved = await supabaseAdmin.from("bot_settings").upsert({ key: cursorKey, value: last?.id ?? "" }, { onConflict: "key" });
  if (saved.error) throw new Error("Could not checkpoint product artwork scan");
  return { scanned: rows?.length ?? 0, prepared };
}