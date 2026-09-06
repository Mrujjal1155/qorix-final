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
  const merged = new Map<string, SupplierAlert>();
  for (const item of [...items, ...current]) if (!merged.has(item.id)) merged.set(item.id, item);
  await writeAlerts(Array.from(merged.values()), db);
}

export async function clearAlerts() {
  await writeAlerts([]);
}

/* ----------------------------------------------- notification queue + log */

type NotifyBase = {
  event_id: string;
  product_id: string;
  channel_sent?: boolean;
  dm_cursor?: number;
  /** Failed attempts so far — drives the backoff below. */
  tries?: number;
  /** Epoch ms before which this card must not be retried. */
  next_at?: number;
  /** Epoch ms the event was detected — anything older than STALE_MS is dropped. */
  at?: number;
};

type NotifyItem =
  | ({ t: "restock"; qty: number } & NotifyBase)
  | ({ t: "low"; stock: number } & NotifyBase)
  | ({ t: "new" } & NotifyBase)
  | ({ t: "price"; old_price: number; new_price: number } & NotifyBase);

const QUEUE_PREFIX = "supplier_notify_queue:";
const NOTIFY_LOG_KEY = "supplier_notify_log";
const STATS_KEY = "supplier_sync_stats";
const CUTOVER_KEY = "supplier_alert_cutover_at";
/** Per product+kind announcement cooldown, kills the 0→N→0 catalogue churn. */
const RECENT_KEY = "supplier_notify_recent";
const COOLDOWN_MS = 30 * 60_000;
/** A queued card older than this is no longer "live" — drop it silently. */
const STALE_MS = 10 * 60_000;
/**
 * Telegram work is bounded per run so a single invocation can never exceed the
 * Cloudflare subrequest/CPU budget — that is what used to kill the whole run
 * (queues stayed full for hours and no card was ever delivered).
 * Worst case per run: CARDS_PER_RUN * (1 channel post + DM_PER_RUN DMs).
 */
const CARDS_PER_RUN = 4;
const DM_PER_RUN = 25;
/** Give up (and log) after this many failed attempts for one event. */
const MAX_TRIES = 8;


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

async function writeJsonValue(sb: any, key: string, value: unknown) {
  await sb.from("bot_settings").upsert({ key, value: JSON.stringify(value) }, { onConflict: "key" });
}

async function appendLog(sb: any, entries: any[]) {
  if (!entries.length) return;
  const prev = await readJsonSetting(sb, NOTIFY_LOG_KEY);
  await writeJsonSetting(sb, NOTIFY_LOG_KEY, [...entries.reverse(), ...prev].slice(0, 60));
}

/**
 * Append pending alerts for one supplier, de-duplicated per event id AND per
 * product+kind cooldown. Supplier catalogues regularly drop and re-add the same
 * item (paging gaps, short outages); without the cooldown every such flap
 * produced another "restock"/"sold out" card for stock that never changed.
 */
async function enqueueNotifications(sb: any, supplierId: string, items: NotifyItem[]) {
  if (!items.length) return;
  const now = Date.now();
  const key = QUEUE_PREFIX + supplierId;
  const current = (await readJsonSetting(sb, key)) as NotifyItem[];
  const merged = new Map<string, NotifyItem>();
  // Existing entries win: they may already carry delivery progress (cursor).
  for (const it of items) merged.set(it.event_id, { ...it, at: now });
  for (const it of current) merged.set(it.event_id, it);
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
  // A run that was cut off mid-send leaves a stale "sending" marker behind.
  // Keep the window short so the next tick retries instead of going silent.
  if (old.status === "sending" && Number.isFinite(claimedAt) && Date.now() - claimedAt < 45_000) return "busy";

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

/** Exponential backoff (capped) so a broken Telegram config is not hammered. */
function backoffMs(tries: number) {
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, tries - 1));
}

/**
 * Send queued cards for one supplier to the channel and to bot users.
 * The queue is rewritten to the database after EVERY card, so a run that is cut
 * short by the platform never loses (or repeats) delivered work.
 */
async function drainSupplierQueue(sb: any, supplierId: string, budget: { cards: number }) {
  const key = QUEUE_PREFIX + supplierId;
  let queue = (await readJsonSetting(sb, key)) as NotifyItem[];
  if (!queue.length) return { sent: 0, failed: 0 };

  // Anything that sat in the queue too long is history, not news. Drop it
  // (counted as done) so the channel only ever shows live supplier activity.
  const startedAt = Date.now();
  // Legacy queue entries did not carry `at`; they are old by definition and
  // must never survive a live-only cutover forever.
  const stale = queue.filter((item) => !Number.isFinite(Number(item.at)) || startedAt - Number(item.at) > STALE_MS);
  if (stale.length) {
    queue = queue.filter((item) => !stale.includes(item));
    await writeJsonSetting(sb, key, queue);
    for (const item of stale) await finishNotification(sb, item.event_id, true).catch(() => {});
  }
  if (!queue.length) return { sent: 0, failed: 0 };

  const { notifyRestock, announceLowStock, announceNewProduct, announcePriceChange } = await import(
    "@/lib/bot/engine.server"
  );
  const log: any[] = [];
  let sent = 0;
  let failed = 0;

  while (budget.cards > 0) {
    const now = Date.now();
    const index = queue.findIndex((item) => !item.next_at || item.next_at <= now);
    if (index < 0) break;
    const item = queue[index]!;
    budget.cards -= 1;


    const remove = async () => {
      queue = queue.filter((q) => q.event_id !== item.event_id);
      await writeJsonSetting(sb, key, queue);
    };
    const keepWith = async (patch: Partial<NotifyItem>) => {
      queue = queue.map((q) => (q.event_id === item.event_id ? ({ ...q, ...patch } as NotifyItem) : q));
      await writeJsonSetting(sb, key, queue);
    };

    try {
      const claim = await claimNotification(sb, item.event_id);
      if (claim === "delivered") {
        await remove();
        continue;
      }
      if (claim === "busy") {
        await keepWith({ next_at: now + 30_000 });
        continue;
      }

      let delivery: { channel?: boolean; dmComplete?: boolean; dmCursor?: number } | undefined;
      const progress = { channelSent: item.channel_sent ?? false, dmAfter: item.dm_cursor ?? 0, dmLimit: DM_PER_RUN };
      if (item.t === "restock") {
        delivery = await notifyRestock(item.product_id, item.qty, progress);
      } else {
        const { data: prod } = await sb.from("products").select("*").eq("id", item.product_id).maybeSingle();
        if (!prod) throw new Error("Linked product no longer exists");
        if (item.t === "low") delivery = await announceLowStock(prod, item.stock, progress);
        else if (item.t === "price") delivery = await announcePriceChange(prod, item.old_price, item.new_price, progress);
        else delivery = await announceNewProduct(prod, progress);
      }

      if (delivery && !delivery.dmComplete) {
        // Channel post is done; bot DMs continue on the next tick from the cursor.
        await keepWith({ channel_sent: true, dm_cursor: delivery.dmCursor ?? item.dm_cursor ?? 0, next_at: 0, tries: 0 });
        await finishNotification(sb, item.event_id, false, "Bot-user delivery continues on the next automatic run");
        continue;
      }

      await finishNotification(sb, item.event_id, true);
      await remove();
      sent += 1;
      log.push({ at: new Date().toISOString(), kind: item.t, product_id: item.product_id, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failed += 1;
      console.error("Supplier alert failed:", item.event_id, message);
      await finishNotification(sb, item.event_id, false, message).catch(() => {});
      const tries = (item.tries ?? 0) + 1;
      if (tries >= MAX_TRIES) {
        await remove();
        log.push({ at: new Date().toISOString(), kind: item.t, product_id: item.product_id, ok: false, dropped: true, error: message });
      } else {
        await keepWith({ tries, next_at: Date.now() + backoffMs(tries) });
        log.push({ at: new Date().toISOString(), kind: item.t, product_id: item.product_id, ok: false, tries, error: message });
      }
    }
  }

  await appendLog(sb, log);
  return { sent, failed };
}

/**
 * Deliver pending cards for every supplier. Runs sequentially with a shared
 * budget so the whole invocation stays far below the platform request limit.
 */
export async function drainAllNotifications(sb?: any) {
  const db = sb ?? (await adminDb());
  const { data: sups } = await db.from("suppliers").select("id,name").eq("is_enabled", true);
  const budget = { cards: CARDS_PER_RUN };
  let sent = 0;
  let failed = 0;
  for (const supplier of sups ?? []) {
    if (budget.cards <= 0) break;
    try {
      const res = await drainSupplierQueue(db, (supplier as any).id, budget);
      sent += res.sent;
      failed += res.failed;
    } catch (error) {
      console.error(`Supplier notifications failed for ${(supplier as any).name}:`, error);
    }
  }
  return { sent, failed };
}



/**
 * Pull one supplier's catalogue, update listed products and return what changed.
 * `sb` may be the admin client or an authenticated admin session client.
 */
async function claimSupplierSync(sb: any, supplierId: string) {
  const key = `supplier_sync_lock:${supplierId}`;
  const { data: row } = await sb.from("bot_settings").select("value").eq("key", key).maybeSingle();
  const oldValue = String(row?.value ?? "");
  const oldAt = Date.parse(oldValue);
  if (Number.isFinite(oldAt) && Date.now() - oldAt < 45_000) return false;
  const value = new Date().toISOString();
  if (!row) {
    const { error } = await sb.from("bot_settings").insert({ key, value });
    return !error;
  }
  const { data: claimed } = await sb
    .from("bot_settings")
    .update({ value })
    .eq("key", key)
    .eq("value", oldValue)
    .select("key")
    .maybeSingle();
  return Boolean(claimed);
}

async function releaseSupplierSync(sb: any, supplierId: string) {
  await sb.from("bot_settings").update({ value: "" }).eq("key", `supplier_sync_lock:${supplierId}`);
}

export async function syncSupplierCore(sb: any, s: SupplierRow & Record<string, any>) {
  const claimed = await claimSupplierSync(sb, String(s.id));
  if (!claimed) return { ok: true, message: "Sync already running", added: 0, restocked: 0, checked: 0, priceChanges: 0, lowOrOut: 0 };
  try {
    return await syncSupplierCoreUnlocked(sb, s);
  } finally {
    await releaseSupplierSync(sb, String(s.id));
  }
}

async function syncSupplierCoreUnlocked(sb: any, s: SupplierRow & Record<string, any>) {
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
  const pricePosts: Array<{ product_id: string; old_price: number; new_price: number; event_id: string }> = [];
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
    // Stable for overlapping cron/webhook runs that read the same snapshot.
    // The delivery claim then guarantees exactly one Telegram announcement.
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
      // Always rewrite the detail rows so fields the supplier stopped sending
      // (or fields we no longer publish) disappear on the next sync.
      productPatch.details = extraDetailsFromRaw(p.raw);

      productUpdates.push({ id: prev.product_id, patch: productPatch });

      // Real selling-price change on a live product → its own card. Compared
      // against the stored product price, so repeating the same catalogue
      // response never re-announces the same price.
      const livePrice = Number(productsById.get(String(prev.product_id))?.price ?? NaN);
      if (Number.isFinite(livePrice) && Math.abs(livePrice - Number(price)) >= 0.01) {
        pricePosts.push({
          product_id: prev.product_id,
          old_price: livePrice,
          new_price: Number(price),
          event_id: `price:${s.id}:${p.external_id}:${livePrice}:${Number(price)}`,
        });
      }


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
        id: `restock:${transitionId}`,
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

  // Never infer stock=0 from an omitted catalogue row. Supplier APIs can return
  // partial pages or temporarily omit products; treating that as sold out made
  // the next healthy response look like a fresh restock and caused the same old
  // cards to repeat. Explicit stock=0 values are still handled above.

  // Persist detected events BEFORE the snapshot is overwritten. If this run is
  // cut short afterwards, the transition is already queued instead of lost
  // forever (the old snapshot would otherwise be gone with no card sent).
  await enqueueNotifications(sb, s.id, [
    ...restockPosts.map((r) => ({ t: "restock" as const, product_id: r.product_id, qty: r.qty, event_id: r.event_id })),
    ...lowPosts.map((l) => ({ t: "low" as const, product_id: l.product_id, stock: l.stock, event_id: l.event_id })),
    ...pricePosts.map((pp) => ({
      t: "price" as const,
      product_id: pp.product_id,
      old_price: pp.old_price,
      new_price: pp.new_price,
      event_id: pp.event_id,
    })),
  ]);

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
        // Canboso sends a per-product `emoji`, but as a slug ("claude",
        // "chatgpt", "none"), not a glyph — only adopt it when it is an
        // actual emoji character, otherwise keep the default icon.
        const rawEmojiValue = typeof (p.raw as any)?.emoji === "string" ? (p.raw as any).emoji.trim() : "";
        const rawEmoji = /[^\x00-\x7F]/u.test(rawEmojiValue) ? rawEmojiValue : "";
        const productRow: any = {
          name: p.name,
          description: d.description ?? (d.quick_guide || d.important_note ? null : p.description),
          price,
          delivery_type: "auto",
          supplier_id: s.id,
          supplier_external_id: String(p.external_id),
          supplier_stock: p.stock,
          is_active: Boolean(s["is_enabled"]),
          emoji: rawEmoji || icon.glyph || "📦",
          telegram_custom_emoji_id: rawEmoji ? null : icon.customId || null,
        };
        if (d.image_url) productRow.image_url = d.image_url;
        if (d.delivery_time) productRow.delivery_time = d.delivery_time;
        if (d.important_note) productRow.important_note = d.important_note;
        if (d.quick_guide) productRow.quick_guide = d.quick_guide;
        productRow.details = extraDetailsFromRaw(p.raw);


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

  // Newly auto-listed products are queued here (they only exist after the
  // product rows above were created). Stock/price events were queued earlier.
  await enqueueNotifications(
    sb,
    s.id,
    newPosts.map((n) => ({ t: "new" as const, product_id: n.product_id, event_id: n.event_id })),
  );

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
    checked: uniqueRemote.length,
    priceChanges: pricePosts.length,
    lowOrOut: lowPosts.length,
  };
}

/** Sync every enabled supplier. Used by the background/auto sync. */
export async function syncAllSuppliers() {
  const db = await adminDb();
  const { data: sups } = await db.from("suppliers").select("*").eq("is_enabled", true);

  // Delivery FIRST. Catalogue polling is the heavy part of a run; when it used
  // to go first, a slow supplier API could eat the whole invocation and the
  // queued Telegram cards were never sent (queues sat full for hours).
  const delivery = await drainAllNotifications(db).catch((error) => {
    console.error("Notification drain failed:", error);
    return { sent: 0, failed: 1 };
  });

  // Keep push webhooks registered on their own — no admin button needed. The
  // helper is a no-op unless the endpoint is missing, moved or unverified.
  {
    const { ensureSupplierWebhook } = await import("./webhook.server");
    await Promise.allSettled(
      (sups ?? []).map((s: any) =>
        ensureSupplierWebhook(db, s).catch((error) => {
          console.error(`Webhook registration failed for ${s.name}:`, error);
        }),
      ),
    );
  }

  let added = 0;
  let restocked = 0;
  let checked = 0;
  let priceChanges = 0;
  let lowOrOut = 0;
  let failedSuppliers = 0;
  let lastError = "";
  // Suppliers run side by side so one slow API can't push a single run past the
  // 15s schedule interval.
  const results = await Promise.allSettled((sups ?? []).map((s: any) => syncSupplierCore(db, s)));

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) {
      added += r.value.added;
      restocked += r.value.restocked;
      checked += (r.value as any).checked ?? 0;
      priceChanges += (r.value as any).priceChanges ?? 0;
      lowOrOut += (r.value as any).lowOrOut ?? 0;
    } else {
      failedSuppliers += 1;
      lastError =
        r.status === "fulfilled"
          ? String((r.value as any).message ?? "Sync failed")
          : r.reason instanceof Error
            ? r.reason.message
            : String(r.reason);
      console.error("Supplier sync crashed:", lastError);
    }
  }

  const finishedAt = new Date().toISOString();
  await writeJsonValue(db, STATS_KEY, {
    at: finishedAt,
    suppliers: (sups ?? []).length,
    failed_suppliers: failedSuppliers,
    checked,
    new_products: added,
    restocks: restocked,
    price_changes: priceChanges,
    low_or_out: lowOrOut,
    telegram_sent: delivery.sent,
    telegram_failed: delivery.failed,
    last_error: lastError || null,
  });

  await db.from("bot_settings").upsert({ key: "supplier_last_autosync", value: finishedAt }, { onConflict: "key" });
  if (!failedSuppliers) {
    await db
      .from("bot_settings")
      .upsert({ key: "supplier_last_successful_sync", value: finishedAt }, { onConflict: "key" });
  }
  return { ok: true, suppliers: (sups ?? []).length, added, restocked, ...delivery };
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
  if (Number.isFinite(last) && Date.now() - last < every * 60_000) {
    // Throttled for catalogue polling, but pending Telegram cards must never
    // wait for the next window — deliver them on every tick.
    const delivery = await drainAllNotifications(db).catch(() => ({ sent: 0, failed: 1 }));
    return { skipped: true, ...delivery };
  }

  // Claim the slot immediately (acts as a lock for concurrent requests).
  await db
    .from("bot_settings")
    .upsert({ key: "supplier_last_autosync", value: new Date().toISOString() }, { onConflict: "key" });

  return await syncAllSuppliers();
}

/**
 * Discard every pre-cutover alert and take a clean supplier snapshot. This is
 * intentionally separate from normal sync so operational cleanup never sends
 * historical cards while rebuilding the baseline.
 */
export async function resetSupplierAlertBaseline(sb?: any) {
  const db = sb ?? (await adminDb());
  const cutover = new Date().toISOString();
  const { data: suppliers } = await db.from("suppliers").select("*").eq("is_enabled", true);

  const queueKeys = (suppliers ?? []).map((supplier: any) => QUEUE_PREFIX + String(supplier.id));
  const settings = [
    { key: ALERTS_KEY, value: "[]" },
    { key: NOTIFY_LOG_KEY, value: "[]" },
    { key: RECENT_KEY, value: "[]" },
    { key: CUTOVER_KEY, value: cutover },
    ...queueKeys.map((key: string) => ({ key, value: "[]" })),
  ];
  const { error: clearError } = await db.from("bot_settings").upsert(settings, { onConflict: "key" });
  if (clearError) throw new Error(`Could not clear old supplier alerts: ${clearError.message}`);

  // Snapshot silently: refresh catalogue rows and linked product stock without
  // producing admin-feed or Telegram events from pre-cutover differences.
  for (const supplier of suppliers ?? []) {
    const remote = await supplierProducts(supplier as any);
    const uniqueRemote = Array.from(
      new Map(remote.filter((p) => p.external_id != null).map((p) => [String(p.external_id), p])).values(),
    );
    const rows = uniqueRemote.map((p) => ({
      supplier_id: (supplier as any).id,
      external_id: p.external_id,
      name: p.name,
      description: p.description,
      cost_price: p.cost_price,
      stock: p.stock,
      currency: p.currency,
      min_qty: p.min_qty,
      raw: p.raw,
      last_synced_at: cutover,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("supplier_products").upsert(rows.slice(i, i + 200), {
        onConflict: "supplier_id,external_id",
      });
      if (error) throw new Error(`Could not reset ${String((supplier as any).name)} baseline: ${error.message}`);
    }

    const { data: links } = await db
      .from("supplier_products")
      .select("product_id,external_id")
      .eq("supplier_id", (supplier as any).id)
      .not("product_id", "is", null);
    const stockByExternal = new Map(uniqueRemote.map((p) => [String(p.external_id), Number(p.stock)]));
    for (const link of links ?? []) {
      const stock = stockByExternal.get(String((link as any).external_id));
      if (stock == null) continue;
      await db.from("products").update({ supplier_stock: stock }).eq("id", (link as any).product_id);
    }
  }

  return { ok: true, cutover, suppliers: (suppliers ?? []).length };
}
