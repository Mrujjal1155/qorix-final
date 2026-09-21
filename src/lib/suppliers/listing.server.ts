/**
 * Shared "publish this supplier item" logic.
 *
 * Used by the admin supplier table toggle and by the review-queue approval, so
 * both paths create/refresh the store product in exactly the same way.
 */
export type SupplierListingInput = {
  id: string;
  is_listed?: boolean;
  markup_percent?: number | null;
  markup_fixed?: number | null;
  price_override?: number | null;
  category_id?: string | null;
};

export async function applySupplierProductUpdate(sb: any, data: SupplierListingInput) {
  const { data: row } = await sb.from("supplier_products").select("*").eq("id", data.id).maybeSingle();
  if (!row) throw new Error("Not found");
  const { data: sup } = await sb.from("suppliers").select("*").eq("id", row.supplier_id).maybeSingle();

  const patch: any = {};
  for (const k of ["is_listed", "markup_percent", "markup_fixed", "price_override"] as const) {
    if (data[k] !== undefined) patch[k] = data[k];
  }
  // Base cost for the custom price: later supplier increases are added on top.
  if (data.price_override !== undefined) {
    patch.override_cost_base =
      data.price_override != null && Number(data.price_override) > 0 ? Number(row.cost_price ?? 0) : null;
  }
  const merged = { ...row, ...patch };

  const { sellPrice, detailsFromRaw, extraDetailsFromRaw, supplierDeliveryType } = await import(
    "@/lib/suppliers/api.server"
  );
  const price = sellPrice(Number(merged.cost_price), {
    price_override: merged.price_override,
    markup_percent: merged.markup_percent,
    markup_fixed: merged.markup_fixed,
    supplier_percent: sup?.markup_percent,
    supplier_fixed: sup?.markup_fixed,
  });

  if (merged.is_listed) {
    const d = detailsFromRaw(merged.raw);
    const productRow: any = {
      name: merged.name,
      description: d.description ?? merged.description,
      price,
      delivery_type: supplierDeliveryType(merged.raw),
      supplier_id: merged.supplier_id,
      supplier_external_id: merged.external_id,
      supplier_stock: merged.stock,
      // Only an explicit "list it" switch turns a product on; editing markup
      // or a custom price must never re-enable something the admin turned off.
      ...(data.is_listed === true ? { is_active: Boolean(sup?.is_enabled) } : {}),
    };
    if (d.image_url) productRow.image_url = d.image_url;
    if (d.delivery_time) productRow.delivery_time = d.delivery_time;
    if (d.important_note) productRow.important_note = d.important_note;
    if (d.quick_guide) productRow.quick_guide = d.quick_guide;
    const extraDetails = extraDetailsFromRaw(merged.raw);
    if (extraDetails.length) productRow.details = extraDetails;

    if (data.category_id !== undefined) productRow.category_id = data.category_id || null;

    // A product may already exist for this supplier item (link lost, earlier
    // failed save, or a parallel toggle). Reuse it instead of creating a twin.
    let targetProductId: string | null = merged.product_id ?? null;
    if (targetProductId) {
      const { data: stillThere } = await sb.from("products").select("id").eq("id", targetProductId).maybeSingle();
      if (!stillThere) targetProductId = null;
    }
    if (!targetProductId) {
      const { data: existingProduct } = await sb
        .from("products")
        .select("id")
        .eq("supplier_id", merged.supplier_id)
        .eq("supplier_external_id", merged.external_id)
        .maybeSingle();
      targetProductId = existingProduct?.id ?? null;
      if (targetProductId) patch.product_id = targetProductId;
    }

    if (targetProductId) {
      const { error } = await sb.from("products").update(productRow).eq("id", targetProductId);
      if (error) throw new Error(error.message);
    } else {
      // Supplier products have no icon of their own — reuse the admin's
      // default product icon (Premium custom emoji supported).
      const { data: iconRow } = await sb
        .from("bot_settings")
        .select("value")
        .eq("key", "ui_icon_prod_icon_default")
        .maybeSingle();
      const { parseIconValue } = await import("@/lib/bot/ui.server");
      const icon = parseIconValue(String(iconRow?.value ?? ""), "📦");
      // products has only a PARTIAL unique index on
      // (supplier_id, supplier_external_id), which ON CONFLICT cannot use,
      // so the lookup above decides between update and plain insert.
      const { data: created, error } = await sb
        .from("products")
        .insert({
          emoji: icon.glyph || "📦",
          telegram_custom_emoji_id: icon.customId || null,
          ...productRow,
          is_active: Boolean(sup?.is_enabled),
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      patch.product_id = created?.id ?? null;
    }
  } else if (merged.product_id) {
    await sb.from("products").update({ is_active: false }).eq("id", merged.product_id);
  }

  const { error: upErr } = await sb.from("supplier_products").update(patch).eq("id", data.id);
  if (upErr) throw new Error(upErr.message);

  // Listing switched OFF -> ON: the admin decided to sell it, so the channel
  // gets a NEW PRODUCT card right away. Products left OFF stay silent and are
  // only visible through the admin bell feed.
  const wasListed = Boolean(row.is_listed);
  const productId = patch.product_id ?? merged.product_id;
  if (!wasListed && merged.is_listed && productId) {
    const { enqueueNewProduct } = await import("@/lib/suppliers/sync.server");
    await enqueueNewProduct(sb, productId, `supplier_listing:${row.supplier_id}`, `listing:${data.id}`);
  }

  return { ok: true, price };
}
