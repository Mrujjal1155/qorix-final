/**
 * Supplier catalogue sync core.
 *
 * Shared by the admin "Sync catalogue" button and the automatic background
 * sync. It records every new supplier product / restock into an alert feed
 * (bot_settings key `supplier_alerts`) so the admin bell can show them, and
 * posts BACK IN STOCK cards to the Telegram channel for listed products.
 */
import { supplierProducts, sellPrice, detailsFromRaw, extraDetailsFromRaw, type SupplierRow } from "./api.server";

export type SupplierAlert = {
  id: string;
  at: string;
  kind: "new" | "restock";
  supplier: string;
  supplier_id: string;
  product: string;
  qty: number;
  listed: boolean;
};

const ALERTS_KEY = "supplier_alerts";
const MAX_ALERTS = 60;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function readAlerts(): Promise<SupplierAlert[]> {
  const db = await adminDb();
  const { data } = await db.from("bot_settings").select("value").eq("key", ALERTS_KEY).maybeSingle();
  try {
    const parsed = JSON.parse(data?.value || "[]");
    return Array.isArray(parsed) ? (parsed as SupplierAlert[]) : [];
  } catch {
    return [];
  }
}

async function writeAlerts(alerts: SupplierAlert[], client?: any) {
  const db = client ?? (await adminDb());
  await db
    .from("bot_settings")
    .upsert({ key: ALERTS_KEY, value: JSON.stringify(alerts.slice(0, MAX_ALERTS)) }, { onConflict: "key" });
}

export async function pushAlerts(items: SupplierAlert[], client?: any) {
  if (!items.length) return;
  const db = client ?? (await adminDb());
  const { data } = await db.from("bot_settings").select("value").eq("key", ALERTS_KEY).maybeSingle();
  let current: SupplierAlert[] = [];
  try {
    const parsed = JSON.parse(data?.value || "[]");
    if (Array.isArray(parsed)) current = parsed as SupplierAlert[];
  } catch {
    current = [];
  }
  await writeAlerts([...items, ...current], db);
}

export async function clearAlerts() {
  await writeAlerts([]);
}

/* ----------------------------------------------- notification queue + log */

type NotifyItem =
  | { t: "restock"; product_id: string; qty: number; event_id: string; channel_sent?: boolean; dm_cursor?: number }
  | { t: "low"; product_id: string; stock: number; event_id: string; channel_sent?: boolean; dm_cursor?: number }
  | { t: "new"; product_id: string; event_id: string; channel_sent?: boolean; dm_cursor?: number };

const QUEUE_PREFIX = "supplier_notify_queue:";
const NOTIFY_LOG_KEY = "supplier_notify_log";
/** How many cards one sync run sends before the rest waits for the next run. */
const NOTIFY_PER_RUN = 1;
const DM_PER_RUN = 40;

async function readJsonSetting(sb: any, key: string): Promise<any[]> {
  const { data } = await sb.from("bot_settings").select("value").eq("key", key).maybeSingle();
  try {
    const parsed = JSON.parse((data as any)?.value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJsonSetting(sb: any, key: string, value: any[]) {
  const { error } = await sb.from("bot_settings").upsert({ key, value: JSON.stringify(value) }, { onConflict: "key" });
  if (error) throw new Error(`Could not save notification queue: ${error.message}`);
}

/** Append pending alerts for one supplier, de-duplicated per product+kind. */
async function enqueueNotifications(sb: any, supplierId: string, items: NotifyItem[]) {
  if (!items.length) return;
  const key = QUEUE_PREFIX + supplierId;
  const current = (await readJsonSetting(sb, key)) as NotifyItem[];
  const merged = new Map<string, NotifyItem>();
  for (const it of [...current, ...items]) merged.set(it.event_id || `${it.t}:${it.product_id}`, it);
  await writeJsonSetting(sb, key, Array.from(merged.values()).slice(0, 200));
}

type DeliveryClaim = "claimed" | "delivered" | "busy";

/**
 * Atomically claim one stock transition before touching Telegram. This closes
 * the race where cron, a storefront visit and an admin sync all compare the
 * same old snapshot and would otherwise post the same card more than once.
 */
async function claimNotification(sb: any, eventId: string): Promise<DeliveryClaim> {
  const key = `supplier_notify_delivery:${eventId}`;
  const { data: row } = await sb.from("bot_settings").select("value").eq("key", key).maybeSingle();
  const oldValue = String(row?.value ?? "");
  let old: { status?: string; at?: string } = {};
  try {
    old = JSON.parse(oldValue || "{}");
  } catch {
    old = {};
  }
  if (old.status === "delivered") return "delivered";
  const claimedAt = Date.parse(old.at ?? "");
  if (old.status === "sending" && Number.isFinite(claimedAt) && Date.now() - claimedAt < 120_000) return "busy";

  const value = JSON.stringify({ status: "sending", at: new Date().toISOString() });
  if (!row) {
    const { error } = await sb.from("bot_settings").insert({ key, value });
    return error ? "busy" : "claimed";
  }
  const { data: claimed, error } = await sb
    .from("bot_settings")
    .update({ value })
    .eq("key", key)
    .eq("value", oldValue)
    .select("key")
    .maybeSingle();
  if (error) throw new Error(`Could not claim notification: ${error.message}`);
  return claimed ? "claimed" : "busy";
}

async function finishNotification(sb: any, eventId: string, delivered: boolean, error?: string) {
  const key = `supplier_notify_delivery:${eventId}`;
  const value = JSON.stringify({
    status: delivered ? "delivered" : "failed",
    at: new Date().toISOString(),
    ...(error ? { error: error.slice(0, 300) } : {}),
  });
  const { error: saveError } = await sb.from("bot_settings").update({ value }).eq("key", key);
  if (saveError) throw new Error(`Could not finish notification: ${saveError.message}`);
}

/**
 * Send the queued restock / low-stock cards to the channel and every bot user.
 * Only listed (admin-approved) products ever reach this queue. Every attempt is
 * recorded in `supplier_notify_log` so failures are visible in the admin panel.
 */
async function drainNotifications(sb: any, supplierId: string) {
  const key = QUEUE_PREFIX + supplierId;
  const queue = (await readJsonSetting(sb, key)) as NotifyItem[];
  if (!queue.length) return;
  const batch = queue.slice(0, NOTIFY_PER_RUN);
  const rest = queue.slice(NOTIFY_PER_RUN);

  const { notifyRestock, announceLowStock, announceNewProduct } = await import("@/lib/bot/engine.server");
  const log: any[] = [];
  const failed: NotifyItem[] = [];
  for (const item of batch) {
    const eventId = item.event_id || `${supplierId}:${item.t}:${item.product_id}:${item.t === "low" ? item.stock : item.t === "restock" ? item.qty : "new"}`;
    try {
      const claim = await claimNotification(sb, eventId);
      if (claim === "delivered") continue;
      if (claim === "busy") {
        failed.push(item);
        continue;
      }
      let delivery: { channel?: boolean; dmComplete?: boolean; dmCursor?: number } | undefined;
      if (item.t === "restock") {
        delivery = await notifyRestock(item.product_id, item.qty, {
          channelSent: item.channel_sent ?? false,
          dmAfter: item.dm_cursor ?? 0,
          dmLimit: DM_PER_RUN,
        });
      } else if (item.t === "low") {
        const { data: prod } = await sb.from("products").select("*").eq("id", item.product_id).maybeSingle();
        if (!prod) throw new Error("Linked product no longer exists");
        delivery = await announceLowStock(prod, item.stock, {
          channelSent: item.channel_sent ?? false,
          dmAfter: item.dm_cursor ?? 0,
          dmLimit: DM_PER_RUN,
        });
      } else {
        const { data: prod } = await sb.from("products").select("*").eq("id", item.product_id).maybeSingle();
        if (!prod) throw new Error("Linked product no longer exists");
        delivery = await announceNewProduct(prod, {
          channelSent: item.channel_sent ?? false,
          dmAfter: item.dm_cursor ?? 0,
          dmLimit: DM_PER_RUN,
        });
      }
      if (!delivery?.dmComplete) {
        failed.push({ ...item, channel_sent: true, dm_cursor: delivery?.dmCursor ?? item.dm_cursor ?? 0 });
        await finishNotification(sb, eventId, false, "Bot-user delivery continues on the next automatic run");
        continue;
      }
      log.push({ at: new Date().toISOString(), kind: item.t, product_id: item.product_id, ok: true });
      await finishNotification(sb, eventId, true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Supplier alert failed:", item, message);
      await finishNotification(sb, eventId, false, message).catch(() => {});
      failed.push(item);
      log.push({ at: new Date().toISOString(), kind: item.t, product_id: item.product_id, ok: false, error: message });
    }
  }
  // Remove successful cards only after delivery. Failed cards stay queued and
  // are retried by the next supplier sync instead of being lost forever.
  const retry = new Map<string, NotifyItem>();
  for (const item of [...rest, ...failed]) retry.set(item.event_id || `${item.t}:${item.product_id}`, item);
  await writeJsonSetting(sb, key, Array.from(retry.values()).slice(0, 200));
  if (log.length) {
    const prev = await readJsonSetting(sb, NOTIFY_LOG_KEY);
    await writeJsonSetting(sb, NOTIFY_LOG_KEY, [...log.reverse(), ...prev].slice(0, 40));
  }
}


/**
 * Pull one supplier's catalogue, update listed products and return what changed.
 * `sb` may be the admin client or an authenticated admin session client.
 */
export async function syncSupplierCore(sb: any, s: SupplierRow & Record<string, any>) {
  let remote;
  try {
    remote = await supplierProducts(s);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    await sb.from("suppliers").update({ last_status: message }).eq("id", s.id);
    return { ok: false, message, added: 0, restocked: 0 };
  }

  const [{ data: existing }, { data: linkedProducts }] = await Promise.all([
    sb.from("supplier_products").select("*").eq("supplier_id", s.id),
    sb.from("products").select("*").eq("supplier_id", s.id),
  ]);
  const byExt = new Map<string, any>((existing ?? []).map((r: any) => [String(r.external_id), r]));
  const productsById = new Map<string, any>((linkedProducts ?? []).map((r: any) => [String(r.id), r]));
  const now = new Date().toISOString();
  const alerts: SupplierAlert[] = [];
  const restockPosts: Array<{ product_id: string; qty: number; stock: number; event_id: string }> = [];
  const lowPosts: Array<{ product_id: string; stock: number; event_id: string }> = [];
  const newPosts: Array<{ product_id: string; event_id: string }> = [];
  const newListings: Array<{ external_id: string; remote: any }> = [];
  const productUpdates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  // Settings that control how the automatic supplier feed behaves.
  const { data: cfgRows } = await sb
    .from("bot_settings")
    .select("key,value")
    .in("key", ["supplier_autolist", "announce_low_threshold"]);
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[(r as any).key] = (r as any).value ?? "";
  // New supplier products stay OFF by default: they only land in the admin bell
  // feed and go live once the admin approves them. Turning `supplier_autolist`
  // on makes them list (and announce) automatically.
  // On a supplier's very first import everything looks "new" — stay silent then
  // so the channel never gets a few hundred cards at once.
  const firstImport = (existing ?? []).length === 0;
  const autoList = (cfg["supplier_autolist"] || "off").toLowerCase() === "on" && !firstImport;

  const lowThresholdRaw = Number(cfg["announce_low_threshold"]);
  const lowThreshold = Number.isFinite(lowThresholdRaw) && lowThresholdRaw > 0 ? lowThresholdRaw : 5;


  // Some supplier APIs repeat the same item in one response (paging overlap,
  // variants sharing an id). Keep only the last occurrence per external_id so
  // one sync never processes — or imports — the same product twice.
  const uniqueRemote = Array.from(
    new Map(remote.filter((p) => p.external_id != null).map((p) => [String(p.external_id), p])).values(),
  );
  const remoteIds = new Set(uniqueRemote.map((p) => String(p.external_id)));

  // Every supplier row is written in a few batched upserts instead of one
  // request per product — a 250-item catalogue used to need 250 round trips,
  // which made a single sync run longer than the 15s schedule interval.
  const rowsToWrite: any[] = [];

  for (const p of uniqueRemote) {
    const prev = byExt.get(String(p.external_id));
    const row = {
      supplier_id: s.id,
      external_id: p.external_id,
      name: p.name,
      description: p.description,
      cost_price: p.cost_price,
      stock: p.stock,
      currency: p.currency,
      min_qty: p.min_qty,
      raw: p.raw,
      last_synced_at: now,
    };
    rowsToWrite.push(row);

    if (!prev) {
      // Brand new product from the supplier API. With auto-list ON it goes live
      // straight away and gets a NEW PRODUCT card in the channel + bot DMs.
      if (autoList) newListings.push({ external_id: String(p.external_id), remote: p });
      alerts.push({
        id: `${s.id}:${p.external_id}:new`,
        at: now,
        kind: "new",
        supplier: s.name,
        supplier_id: s.id,
        product: p.name,
        qty: p.stock,
        listed: autoList,
      });
      continue;
    }


    const wasOut = Number(prev.stock ?? 0) <= 0;

    const nowIn = Number(p.stock ?? 0) > 0;
    const grew = Number(p.stock ?? 0) > Number(prev.stock ?? 0);
    const transitionId = `${s.id}:${p.external_id}:${prev.last_synced_at ?? "initial"}:${Number(prev.stock ?? 0)}:${Number(p.stock ?? 0)}`;

    if (prev.is_listed && prev.product_id) {
      const price = sellPrice(p.cost_price, {
        price_override: prev.price_override,
        markup_percent: prev.markup_percent,
        markup_fixed: prev.markup_fixed,
        supplier_percent: s.markup_percent ?? null,
        supplier_fixed: s.markup_fixed ?? null,
      });
      const d = detailsFromRaw(p.raw);
      const productPatch: any = {
        name: p.name,
        // When a labelled block was moved into Quick Guide / Important, don't
        // fall back to the supplier's raw text — that would print it twice.
        description: d.description ?? (d.quick_guide || d.important_note ? null : p.description),

        price,
        supplier_stock: p.stock,
        is_active: Boolean(s["is_enabled"]),
      };
      // Only overwrite the rich fields when the supplier actually sent them —
      // otherwise a sparse sync response would wipe the banner/notes the admin
      // (or an earlier, richer response) already stored.
      if (d.image_url) productPatch.image_url = d.image_url;
      if (d.delivery_time) productPatch.delivery_time = d.delivery_time;
      if (d.important_note) productPatch.important_note = d.important_note;
      if (d.quick_guide) productPatch.quick_guide = d.quick_guide;
      const extra = extraDetailsFromRaw(p.raw);
      if (extra.length) productPatch.details = extra;
      productUpdates.push({ id: prev.product_id, patch: productPatch });


      // Announce when the product comes back from zero AND when the supplier
      // tops up an already-listed product, so the channel gets live updates.
      if ((wasOut && nowIn) || grew) {
        restockPosts.push({
          product_id: prev.product_id,
          qty: Math.max(1, Number(p.stock) - Number(prev.stock ?? 0)),
          stock: Number(p.stock),
          event_id: `restock:${transitionId}`,
        });
      }

      // Stock dropping into the alert zone (or hitting zero) gets its own card.
      const prevStock = Number(prev.stock ?? 0);
      const nowStock = Number(p.stock ?? 0);
      if (nowStock < prevStock && nowStock < lowThreshold && prevStock >= lowThreshold) {
        lowPosts.push({ product_id: prev.product_id, stock: nowStock, event_id: `low:${transitionId}` });
      } else if (nowStock <= 0 && prevStock > 0) {
        lowPosts.push({ product_id: prev.product_id, stock: 0, event_id: `low:${transitionId}` });
      }
    }


    if ((wasOut && nowIn) || (grew && Number(prev.stock ?? 0) > 0 && Number(p.stock) - Number(prev.stock ?? 0) >= 1)) {
      alerts.push({
        id: `${s.id}:${p.external_id}:${now}`,
        at: now,
        kind: "restock",
        supplier: s.name,
        supplier_id: s.id,
        product: p.name,
        qty: Math.max(0, Number(p.stock) - Number(prev.stock ?? 0)),
        listed: Boolean(prev.is_listed),
      });
    }
  }

  // Several suppliers omit sold-out products from their catalogue response
  // instead of returning them with stock=0. Treat a missing item from a
  // successful full catalogue snapshot as sold out; otherwise its old positive
  // stock remains forever and its next appearance can never be a true restock.
  const missingListed = (existing ?? []).filter(
    (prev: any) =>
      prev.is_listed &&
      prev.product_id &&
      Number(prev.stock ?? 0) > 0 &&
      !remoteIds.has(String(prev.external_id)),
  );
  for (const prev of missingListed) {
    lowPosts.push({
      product_id: prev.product_id,
      stock: 0,
      event_id: `low:${s.id}:${prev.external_id}:${prev.last_synced_at ?? "initial"}:${Number(prev.stock ?? 0)}:0`,
    });
    productUpdates.push({
      id: prev.product_id,
      patch: { supplier_stock: 0, is_active: Boolean(s["is_enabled"]) },
    });
  }

  // Mark every omitted catalogue row as observed and out of stock. This keeps
  // the supplier snapshot coherent and lets a later reappearance compare 0→N.
  const missingIds = (existing ?? [])
    .filter((prev: any) => !remoteIds.has(String(prev.external_id)) && Number(prev.stock ?? 0) !== 0)
    .map((prev: any) => prev.id);
  for (let i = 0; i < missingIds.length; i += 200) {
    const { error } = await sb
      .from("supplier_products")
      .update({ stock: 0, last_synced_at: now })
      .in("id", missingIds.slice(i, i + 200));
    if (error) throw new Error(`Could not mark missing ${s.name} products sold out: ${error.message}`);
  }

  // Batched catalogue write (chunked so one payload never gets too large).
  for (let i = 0; i < rowsToWrite.length; i += 200) {
    const { error } = await sb
      .from("supplier_products")
      .upsert(rowsToWrite.slice(i, i + 200), { onConflict: "supplier_id,external_id" });
    if (error) throw new Error(`Could not save ${s.name} catalogue: ${error.message}`);
  }

  // Merge the patches with the rows already fetched above, then upsert them in
  // chunks. This turns hundreds of per-product HTTP subrequests into only a
  // handful, staying safely below Cloudflare's per-invocation request limit.
  const productsToWrite = productUpdates.flatMap(({ id, patch }) => {
    const current = productsById.get(id);
    return current ? [{ ...current, ...patch }] : [];
  });
  for (let i = 0; i < productsToWrite.length; i += 200) {
    const { error } = await sb.from("products").upsert(productsToWrite.slice(i, i + 200), { onConflict: "id" });
    if (error) throw new Error(`Could not update live stock: ${error.message}`);
  }

  // The manual admin sync already has an authenticated admin client. Reuse it
  // instead of requiring the separately configured service-role secret.
  await pushAlerts(alerts, sb);


  // Brand new supplier products: create the store product, link it and post the
  // NEW PRODUCT card to the channel + bot DMs.
  if (newListings.length) {
    const { data: iconRow } = await sb
      .from("bot_settings")
      .select("value")
      .eq("key", "ui_icon_prod_icon_default")
      .maybeSingle();
    const { parseIconValue } = await import("@/lib/bot/ui.server");
    const icon = parseIconValue(String((iconRow as any)?.value ?? ""), "📦");

    for (const item of newListings) {
      const p = item.remote;
      try {
        const price = sellPrice(p.cost_price, {
          price_override: null,
          markup_percent: null,
          markup_fixed: null,
          supplier_percent: s.markup_percent ?? null,
          supplier_fixed: s.markup_fixed ?? null,
        });
        const d = detailsFromRaw(p.raw);
        const productRow: any = {
          name: p.name,
          description: d.description ?? (d.quick_guide || d.important_note ? null : p.description),
          price,
          delivery_type: "auto",
          supplier_id: s.id,
          supplier_external_id: String(p.external_id),
          supplier_stock: p.stock,
          is_active: Boolean(s["is_enabled"]),
          emoji: icon.glyph || "📦",
          telegram_custom_emoji_id: icon.customId || null,
        };
        if (d.image_url) productRow.image_url = d.image_url;
        if (d.delivery_time) productRow.delivery_time = d.delivery_time;
        if (d.important_note) productRow.important_note = d.important_note;
        if (d.quick_guide) productRow.quick_guide = d.quick_guide;
        const extra = extraDetailsFromRaw(p.raw);
        if (extra.length) productRow.details = extra;

        // products only has a PARTIAL unique index on
        // (supplier_id, supplier_external_id), so ON CONFLICT cannot be used:
        // look the row up, then update or insert.
        const { data: existingProd } = await sb
          .from("products")
          .select("id")
          .eq("supplier_id", s.id)
          .eq("supplier_external_id", String(p.external_id))
          .maybeSingle();
        let created: any = null;
        if ((existingProd as any)?.id) {
          const { data: upd } = await sb
            .from("products")
            .update(productRow)
            .eq("id", (existingProd as any).id)
            .select("*")
            .maybeSingle();
          created = upd;
        } else {
          const { data: ins } = await sb
            .from("products")
            .insert(productRow)
            .select("*")
            .maybeSingle();
          created = ins;
        }
        if (!created) continue;


        await sb
          .from("supplier_products")
          .update({ is_listed: true, product_id: (created as any).id })
          .eq("supplier_id", s.id)
          .eq("external_id", String(p.external_id));

        newPosts.push({ product_id: created.id, event_id: `new:${s.id}:${item.external_id}` });
      } catch (e) {
        console.error("Auto-list of new supplier product failed:", e);
      }
    }
  }

  // Group / channel + bot DM posts for products we actually sell.
  // Queued so a run that hits the platform time limit never loses an alert:
  // whatever is left over goes out on the next sync (every 15s).
  await enqueueNotifications(sb, s.id, [
    ...restockPosts.map((r) => ({ t: "restock" as const, product_id: r.product_id, qty: r.qty, event_id: r.event_id })),
    ...lowPosts.map((l) => ({ t: "low" as const, product_id: l.product_id, stock: l.stock, event_id: l.event_id })),
    ...newPosts.map((n) => ({ t: "new" as const, product_id: n.product_id, event_id: n.event_id })),
  ]);



  const added = alerts.filter((a) => a.kind === "new").length;
  const restocked = restockPosts.length;
  await sb
    .from("suppliers")
    .update({ last_synced_at: now, last_status: `Synced ${uniqueRemote.length} products` })
    .eq("id", s.id);

  return {
    ok: true,
    message: `Synced ${uniqueRemote.length} products${added ? ` · ${added} new` : ""}${restocked ? ` · ${restocked} restocked` : ""}`,
    added,
    restocked,
  };
}

/** Sync every enabled supplier. Used by the background/auto sync. */
export async function syncAllSuppliers() {
  const db = await adminDb();
  const { data: sups } = await db.from("suppliers").select("*").eq("is_enabled", true);
  let added = 0;
  let restocked = 0;
  // Suppliers run side by side so one slow API can't push a single run past the
  // 15s schedule interval.
  const results = await Promise.allSettled((sups ?? []).map((s: any) => syncSupplierCore(db, s)));
  for (const r of results) {
    if (r.status === "fulfilled") {
      added += r.value.added;
      restocked += r.value.restocked;
    } else {
      console.error("Supplier sync crashed:", r.reason);
    }
  }

  // Delivery is deliberately separate from catalogue writes. Each supplier
  // advances at most one card and 40 DMs per automatic run, with its cursor
  // persisted in the queue for the next tick.
  for (const supplier of sups ?? []) {
    await drainNotifications(db, supplier.id).catch((error) =>
      console.error(`Supplier notifications failed for ${supplier.name}:`, error),
    );
  }

  await db
    .from("bot_settings")
    .upsert({ key: "supplier_last_autosync", value: new Date().toISOString() }, { onConflict: "key" });
  return { ok: true, suppliers: (sups ?? []).length, added, restocked };
}

/**
 * Run the auto sync at most once every `minutes` (admin can override with the
 * `supplier_sync_minutes` setting). Safe to call very often — it claims the
 * timestamp before syncing so parallel callers never double-run.
 */
export async function maybeAutoSyncSuppliers(minutes = 2) {
  const db = await adminDb();
  const { data } = await db
    .from("bot_settings")
    .select("key,value")
    .in("key", ["supplier_autosync", "supplier_last_autosync", "supplier_sync_minutes"]);
  const map: Record<string, string> = {};
  for (const r of data ?? []) map[(r as any).key] = (r as any).value ?? "";
  // `supplier_autosync` defaults to on.
  if ((map["supplier_autosync"] || "on").toLowerCase() === "off") return { skipped: true };

  const configured = Number(map["supplier_sync_minutes"]);
  const every = Number.isFinite(configured) && configured > 0 ? configured : minutes;

  const last = Date.parse(map["supplier_last_autosync"] || "");
  if (Number.isFinite(last) && Date.now() - last < every * 60_000) return { skipped: true };

  // Claim the slot immediately (acts as a lock for concurrent requests).
  await db
    .from("bot_settings")
    .upsert({ key: "supplier_last_autosync", value: new Date().toISOString() }, { onConflict: "key" });

  return await syncAllSuppliers();
}
