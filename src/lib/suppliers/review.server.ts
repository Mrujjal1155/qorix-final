/**
 * Quarantine queue for supplier catalogue changes.
 *
 * A brand-new supplier item, or an item whose supplier id rotated without a
 * trusted previous listing, lands here instead of the live catalogue. Nothing
 * reaches the bot / website / reseller API until an admin approves it.
 */
export type ReviewReason = "new" | "rotated";

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type ReviewInput = {
  supplier_id: string;
  external_id: string;
  reason: ReviewReason;
  name: string;
  cost_price?: number;
  price?: number;
  stock?: number;
  product_id?: string | null;
  snapshot?: Record<string, unknown>;
};

/**
 * Adds pending rows. Existing rows (pending, approved or rejected) are left
 * untouched, so a rejected item never comes back on the next sync.
 */
export async function enqueueReview(items: ReviewInput[], sb?: any) {
  if (!items.length) return 0;
  const db = sb ?? (await adminDb());
  const rows = items.map((it) => ({
    supplier_id: it.supplier_id,
    external_id: String(it.external_id),
    product_id: it.product_id ?? null,
    reason: it.reason,
    name: it.name ?? "",
    cost_price: Number(it.cost_price ?? 0),
    price: Number(it.price ?? 0),
    stock: Number(it.stock ?? 0),
    snapshot: it.snapshot ?? {},
    status: "pending",
  }));
  const { error } = await db
    .from("supplier_review_queue")
    .upsert(rows, { onConflict: "supplier_id,external_id", ignoreDuplicates: true });
  if (error) {
    console.error("[review-queue] enqueue failed:", error.message);
    return 0;
  }
  return rows.length;
}

/** External ids an admin already rejected — sync must keep ignoring them. */
export async function rejectedExternalIds(supplierId: string, sb?: any): Promise<Set<string>> {
  const db = sb ?? (await adminDb());
  const { data } = await db
    .from("supplier_review_queue")
    .select("external_id")
    .eq("supplier_id", supplierId)
    .eq("status", "rejected");
  return new Set((data ?? []).map((r: any) => String(r.external_id)));
}

/** Approve: publish each queued item exactly like an admin "list it" toggle. */
export async function approveReviewItems(sb: any, ids: string[], categoryId?: string | null) {
  const { data: rows } = await sb.from("supplier_review_queue").select("*").in("id", ids);
  const { applySupplierProductUpdate } = await import("@/lib/suppliers/listing.server");
  let approved = 0;
  const failed: string[] = [];
  for (const row of rows ?? []) {
    const { data: sp } = await sb
      .from("supplier_products")
      .select("id")
      .eq("supplier_id", row.supplier_id)
      .eq("external_id", row.external_id)
      .maybeSingle();
    if (!sp?.id) {
      failed.push(row.name || row.external_id);
      continue;
    }
    try {
      await applySupplierProductUpdate(sb, {
        id: sp.id,
        is_listed: true,
        ...(categoryId !== undefined ? { category_id: categoryId } : {}),
      });
      await sb
        .from("supplier_review_queue")
        .update({ status: "approved", decided_at: new Date().toISOString() })
        .eq("id", row.id);
      approved++;
    } catch (e: any) {
      console.error("[review-queue] approve failed:", e?.message ?? e);
      failed.push(row.name || row.external_id);
    }
  }
  return { approved, failed };
}

/** Reject: keep the item hidden forever and stop future syncs re-queuing it. */
export async function rejectReviewItems(sb: any, ids: string[]) {
  const { data: rows } = await sb.from("supplier_review_queue").select("*").in("id", ids);
  for (const row of rows ?? []) {
    if (row.product_id) {
      await sb.from("products").update({ is_active: false }).eq("id", row.product_id);
    }
    await sb
      .from("supplier_products")
      .update({ is_listed: false })
      .eq("supplier_id", row.supplier_id)
      .eq("external_id", row.external_id);
  }
  const { error } = await sb
    .from("supplier_review_queue")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
  return { rejected: (rows ?? []).length };
}
