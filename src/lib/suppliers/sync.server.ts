/**
 * Supplier catalogue sync core.
 *
 * Shared by the admin "Sync catalogue" button and the automatic background
 * sync. It records every new supplier product / restock into an alert feed
 * (bot_settings key `supplier_alerts`) so the admin bell can show them, and
 * posts BACK IN STOCK cards to the Telegram channel for listed products.
 */
import {
  supplierProducts,
  sellPrice,
  detailsFromRaw,
  extraDetailsFromRaw,
  supplierDeliveryType,
  type SupplierRow,
} from "./api.server";
import type { ReviewInput } from "./review.server";

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

async function readAllSupplierRows(sb: any, table: "supplier_products" | "products", supplierId: string) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .eq("supplier_id", supplierId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
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
/**
 * A queued card older than this is no longer "live" — drop it silently.
 * Kept generous: a card that is still waiting for its turn (budget, backoff,
 * partial DM fan-out) must never be thrown away as "history" while it is
 * actively being delivered. Only genuinely abandoned cards expire.
 */
const STALE_MS = 30 * 60_000;
/** Absolute ceiling — nothing is ever announced later than this, in any state. */
const HARD_STALE_MS = 2 * 60 * 60_000;
/**
 * Telegram work is bounded per run so a single invocation can never exceed the
 * Cloudflare subrequest/CPU budget — that is what used to kill the whole run
 * (queues stayed full for hours and no card was ever delivered).
 * Worst case per run: CARDS_PER_RUN * (1 channel post + DM_PER_RUN DMs).
 */
const CARDS_PER_RUN = 8;
const DM_PER_RUN = 40;
/** Hard cap for one card's channel post + DM batch. */
const CARD_TIMEOUT_MS = 9_000;
/** Wall-clock budget for one delivery run (scheduler cuts us off at ~28s). */
const DRAIN_BUDGET_MS = 14_000;

/** Give up (and log) after this many failed attempts for one event. */
const MAX_TRIES = 8;

/**
 * How much catalogue work one worker invocation may take on. Reading every
 * supplier in a single run exceeded the platform budget and the run died before
 * writing anything; a slice per tick keeps each run small and every supplier
 * still refreshes within a few ticks.
 */
const SUPPLIERS_PER_RUN = 2;
/** A supplier that does not answer in this time is skipped for this run. */
const SUPPLIER_TIMEOUT_MS = 12_000;
/** Push-webhook registration is verified this often, not on every tick. */
const WEBHOOK_CHECK_MS = 10 * 60_000;
/** Supplier announcements are polled this often. */
const ANNOUNCE_CHECK_MS = 5 * 60_000;


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

/**
 * Simple time gate stored in the database, so it survives worker restarts and
 * deployments: returns true (and stamps "now") only when `everyMs` has passed
 * since the last time this key was due.
 */
async function dueEvery(sb: any, key: string, everyMs: number): Promise<boolean> {
  const { data } = await sb.from("bot_settings").select("value").eq("key", key).maybeSingle();
  const last = Date.parse(String((data as any)?.value ?? ""));
  if (Number.isFinite(last) && Date.now() - last < everyMs) return false;
  await sb.from("bot_settings").upsert({ key, value: new Date().toISOString() }, { onConflict: "key" });
  return true;
}

/**
 * Poll suppliers that publish announcements and forward new ones to the bot's
 * announcement channel. A supplier without an announcement endpoint is marked
 * unsupported after the first probe so we never call it again.
 */
async function syncSupplierAnnouncements(sb: any, suppliers: any[]) {
  if (!suppliers.length) return;
  if (!(await dueEvery(sb, "supplier_announce_check_at", ANNOUNCE_CHECK_MS))) return;

  const { supplierAnnouncements } = await import("./api.server");
  const { announceSupplierNotice } = await import("@/lib/bot/engine.server");

  for (const s of suppliers) {
    const supportKey = `supplier_announce_supported:${s.id}`;
    const { data: flag } = await sb.from("bot_settings").select("value").eq("key", supportKey).maybeSingle();
    if (String((flag as any)?.value ?? "") === "no") continue;

    let list: Awaited<ReturnType<typeof supplierAnnouncements>> = null;
    try {
      list = await withTimeout(supplierAnnouncements(s), 8_000, `${s.name} announcements`);
    } catch (error) {
      console.error(`Announcement read failed for ${s.name}:`, error);
      continue;
    }
    if (list === null) {
      await sb.from("bot_settings").upsert({ key: supportKey, value: "no" }, { onConflict: "key" });
      continue;
    }
    await sb.from("bot_settings").upsert({ key: supportKey, value: "yes" }, { onConflict: "key" });

    const seenKey = `supplier_announce_seen:${s.id}`;
    const seen = new Set<string>((await readJsonSetting(sb, seenKey)).map((v: any) => String(v)));
    const fresh = list.filter((a) => !seen.has(a.id)).slice(0, 5);
    if (!seen.size) {
      // First look: remember what exists instead of replaying old notices.
      await writeJsonSetting(sb, seenKey, list.map((a) => a.id).slice(0, 200));
      continue;
    }
    for (const a of fresh) {
      await announceSupplierNotice(s.name, a.title, a.body).catch((error) =>
        console.error("Supplier announcement post failed:", error),
      );
      seen.add(a.id);
    }
    if (fresh.length) await writeJsonSetting(sb, seenKey, Array.from(seen).slice(-200));
  }
}

async function appendLog(sb: any, entries: any[]) {
  if (!entries.length) return;
  const prev = await readJsonSetting(sb, NOTIFY_LOG_KEY);
  await writeJsonSetting(sb, NOTIFY_LOG_KEY, [...entries.reverse(), ...prev].slice(0, 60));
}

/**
 * Append pending alerts for one supplier, de-duplicated per event id AND
 * against the delivery ledger. Every supplier goes through this same path, so
 * an event that was already announced (channel + bot) can never be queued a
 * second time — even when a later run still sees the old snapshot because the
 * catalogue write was cut short.
 */
async function enqueueNotifications(sb: any, supplierId: string, items: NotifyItem[]) {
  if (!items.length) return;
  const now = Date.now();
  const key = QUEUE_PREFIX + supplierId;
  const current = (await readJsonSetting(sb, key)) as NotifyItem[];

  // Products the admin has not switched on are invisible in the shop and the
  // bot — they must never produce a single alert. Filter them out here so an
  // off-sale catalogue can't flood the channel/DMs with hundreds of cards.
  const productIds = Array.from(new Set(items.map((it) => it.product_id)));
  const active = new Set<string>();
  for (let i = 0; i < productIds.length; i += 200) {
    const { data } = await sb
      .from("products")
      .select("id,is_active")
      .in("id", productIds.slice(i, i + 200));
    for (const row of data ?? []) if ((row as any).is_active !== false) active.add(String((row as any).id));
  }
  items = items.filter((it) => active.has(it.product_id));
  if (!items.length && !current.length) return;

  // Drop anything the ledger already marked delivered.
  const ids = Array.from(new Set(items.map((it) => `supplier_notify_delivery:${it.event_id}`)));
  const done = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from("bot_settings").select("key,value").in("key", ids.slice(i, i + 100));
    for (const row of data ?? []) {
      let status = "";
      try {
        status = String(JSON.parse(String((row as any).value || "{}"))?.status ?? "");
      } catch {
        status = "";
      }
      if (status === "delivered" || status === "sending") done.add(String((row as any).key).split(":").slice(1).join(":"));
    }
  }
  const fresh = items.filter((it) => !done.has(it.event_id));
  if (!fresh.length && !current.length) return;

  const merged = new Map<string, NotifyItem>();
  // Existing entries win: they may already carry delivery progress (cursor).
  for (const it of fresh) merged.set(it.event_id, { ...it, at: now });
  for (const it of current) merged.set(it.event_id, it);
  await writeJsonSetting(sb, key, Array.from(merged.values()).slice(0, 200));
}

/** Queue id used for in-house (manually uploaded) stock alerts. */
const MANUAL_QUEUE_ID = "manual";

/**
 * Admin uploaded stock by hand → announce it through the exact same durable
 * queue the supplier sync uses, so the restock card (added qty + new total)
 * is retried until Telegram accepts it instead of dying with the request.
 */
export async function enqueueManualRestock(sb: any, productId: string, qty: number) {
  if (!productId || qty <= 0) return;
  await enqueueNotifications(sb, MANUAL_QUEUE_ID, [
    {
      t: "restock",
      qty,
      product_id: productId,
      event_id: `restock:manual:${productId}:${Date.now()}`,
      at: Date.now(),
    } as NotifyItem,
  ]);
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
async function drainSupplierQueue(sb: any, supplierId: string, budget: { cards: number; until?: number }) {
  const key = QUEUE_PREFIX + supplierId;
  let queue = (await readJsonSetting(sb, key)) as NotifyItem[];
  if (!queue.length) return { sent: 0, failed: 0 };

  // Anything abandoned for hours is history, not news. A card that is still
  // being delivered (channel posted, DM cursor moving, retry pending) is NEVER
  // dropped — that silent drop is what made live restocks disappear.
  const startedAt = Date.now();
  const inFlight = (item: NotifyItem) =>
    Boolean(item.channel_sent) || Number(item.dm_cursor ?? 0) > 0 || Number(item.tries ?? 0) > 0;
  // Legacy queue entries did not carry `at`; they are old by definition and
  // must never survive a live-only cutover forever.
  const stale = queue.filter((item) => {
    const age = startedAt - Number(item.at);
    const undated = !Number.isFinite(Number(item.at));
    // Hard ceiling: even a half-delivered card is stale news after this long,
    // so a stuck queue can never wake up hours later and spam everyone.
    if (undated || age > HARD_STALE_MS) return true;
    return !inFlight(item) && age > STALE_MS;
  });
  if (stale.length) {
    queue = queue.filter((item) => !stale.includes(item));
    await writeJsonSetting(sb, key, queue);
    for (const item of stale) {
      await finishNotification(sb, item.event_id, true).catch(() => {});
      console.warn("Supplier alert expired before delivery:", item.event_id);
    }
    await appendLog(
      sb,
      stale.map((item) => ({
        at: new Date().toISOString(),
        kind: item.t,
        product_id: item.product_id,
        ok: false,
        dropped: true,
        error: "expired before delivery",
      })),
    ).catch(() => {});
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
    // Wall-clock guard: the scheduler cuts the request off at ~28s. Stop before
    // that so a claimed card is always released (failed → retried) instead of
    // being left half-claimed as "sending", which silently froze the queue.
    if (budget.until && Date.now() > budget.until) break;
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
      const progress = {
        channelSent: item.channel_sent ?? false,
        dmAfter: item.dm_cursor ?? 0,
        dmLimit: DM_PER_RUN,
        // Persist each successful stage before continuing. Previously this was
        // saved only after the whole channel + DM fan-out returned, so a worker
        // timeout retried the event from the beginning and produced duplicates.
        beforeChannelSend: async () => {
          item.channel_sent = true;
          await keepWith({ channel_sent: true });
        },
        beforeDmSend: async (cursor: number) => {
          item.dm_cursor = cursor;
          await keepWith({ channel_sent: true, dm_cursor: cursor });
        },
      };
      const { data: prod } = await sb.from("products").select("*").eq("id", item.product_id).maybeSingle();
      // Off-sale (or deleted) products are invisible to customers — drop their
      // cards instead of announcing stock nobody can buy.
      if (!prod || (prod as any).is_active === false) {
        await finishNotification(sb, item.event_id, true).catch(() => {});
        await remove();
        continue;
      }
      // A hung Telegram call must never eat the whole invocation: cap it, so a
      // failure is recorded and retried on the next tick.
      const send = async () => {
        if (item.t === "restock") return await notifyRestock(item.product_id, item.qty, progress);
        if (item.t === "low") return await announceLowStock(prod, item.stock, progress);
        if (item.t === "price") return await announcePriceChange(prod, item.old_price, item.new_price, progress);
        return await announceNewProduct(prod, progress);
      };
      delivery = await withTimeout(send(), CARD_TIMEOUT_MS, `${item.t} card`);

      if (delivery && !delivery.dmComplete) {
        // Channel post is done; bot DMs continue on the next tick from the cursor.
        await keepWith({ channel_sent: true, dm_cursor: delivery.dmCursor ?? item.dm_cursor ?? 0, next_at: 0, tries: 0 });
        await finishNotification(sb, item.event_id, false, "Bot-user delivery continues on the next automatic run");
        continue;
      }

      await finishNotification(sb, item.event_id, true);
      await remove();
      sent += 1;
      // Same event, same moment: push it to every reseller webhook too.
      if (prod && (prod as any).is_active !== false) {
        const { pushResellerEvent } = await import("@/lib/reseller/webhook.server");
        const stockNow = Number((prod as any).supplier_stock ?? 0);
        await pushResellerEvent(
          item.t === "low" && stockNow <= 0 ? "out" : (item.t as any),
          prod,
          item.t === "restock"
            ? { added: item.qty }
            : item.t === "low"
              ? { stock: item.stock }
              : item.t === "price"
                ? { old_retail_price: item.old_price, new_retail_price: item.new_price }
                : {},
        );
      }
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
  const budget = { cards: CARDS_PER_RUN, until: Date.now() + DRAIN_BUDGET_MS };
  let sent = 0;
  let failed = 0;
  // In-house (manual) stock uploads share the same durable delivery path.
  try {
    const res = await drainSupplierQueue(db, MANUAL_QUEUE_ID, budget);
    sent += res.sent;
    failed += res.failed;
  } catch (error) {
    console.error("Manual stock notifications failed:", error);
  }
  for (const supplier of sups ?? []) {
    if (budget.cards <= 0 || Date.now() > budget.until) break;
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
  // Short lease: a run the platform kills leaves the lock behind, and the next
  // tick must be able to take it over instead of waiting a whole minute.
  if (Number.isFinite(oldAt) && Date.now() - oldAt < SUPPLIER_TIMEOUT_MS + 5_000) return false;
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

/**
 * Durable per-supplier sync history: when it ran, how long it took, whether it
 * worked and the real error text. Without this a run that the platform kills
 * mid-way leaves no trace at all and the admin panel keeps showing "healthy".
 */
async function recordSyncRun(
  sb: any,
  supplierId: string,
  startedAtMs: number,
  ok: boolean,
  checked: number,
  changed: number,
  error: string | null,
  source = "auto",
) {
  try {
    await sb.from("supplier_sync_runs").insert({
      supplier_id: supplierId,
      started_at: new Date(startedAtMs).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Math.max(0, Date.now() - startedAtMs),
      ok,
      source,
      checked,
      changed,
      error: error ? error.slice(0, 500) : null,
    });
  } catch (e) {
    console.error("Could not record supplier sync run:", e);
  }
}

/** Reject a promise that outlives `ms` so one dead supplier can't eat the run. */
async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: any;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function syncSupplierCore(
  sb: any,
  s: SupplierRow & Record<string, any>,
  opts: { wait?: boolean } = {},
) {
  let claimed = await claimSupplierSync(sb, String(s.id));
  // The admin "Sync catalogue" button used to give up instantly whenever the
  // 15s background poll happened to hold the lock — which is most of the time.
  // A manual run now waits for its turn instead of reporting "already running".
  if (!claimed && opts.wait) {
    const deadline = Date.now() + 20_000;
    while (!claimed && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      claimed = await claimSupplierSync(sb, String(s.id));
    }
    if (!claimed) {
      // Stale lock left behind by an invocation Cloudflare cut short.
      await releaseSupplierSync(sb, String(s.id));
      claimed = await claimSupplierSync(sb, String(s.id));
    }
  }
  if (!claimed) return { ok: true, message: "Sync already running", added: 0, restocked: 0, checked: 0, priceChanges: 0, lowOrOut: 0 };
  try {
    return await syncSupplierCoreUnlocked(sb, s);
  } finally {
    await releaseSupplierSync(sb, String(s.id));
  }
}

function normalizeName(v: unknown): string {
  return String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Suppliers such as Canboso/FatBunny and Qamify hand out a fresh product id for
 * every new batch. Matching only on the stored id then leaves the store product
 * pointing at an id the supplier no longer knows, and each purchase comes back
 * "Product not found". Here we re-point those products at the live id using the
 * product name, and retire the ones that truly disappeared.
 */
/**
 * Dashboard record for supplier-side catalogue events (id rotation, removal).
 * Written to the same `visibility_alerts` table the admin banner already reads.
 */
async function recordSupplierAlerts(
  sb: any,
  rows: Array<{ product_id: string | null; product_name: string; surface: string; detail: string }>,
) {
  if (!rows.length) return;
  try {
    await sb.from("visibility_alerts").insert(rows.slice(0, 50));
  } catch (error) {
    console.error("Supplier alert insert failed:", error);
  }
}

async function relinkRotatedIds(
  sb: any,
  s: SupplierRow & Record<string, any>,
  uniqueRemote: any[],
  linkedProducts: any[],
  byExt: Map<string, any>,
  productsById: Map<string, any>,
  reviewRows: ReviewInput[],
): Promise<{ relinked: number; retired: number }> {
  const liveIds = new Set(uniqueRemote.map((p) => String(p.external_id)));
  const stale = linkedProducts.filter(
    (p: any) => p.supplier_external_id && !liveIds.has(String(p.supplier_external_id)),
  );
  if (!stale.length) return { relinked: 0, retired: 0 };

  const remoteByName = new Map<string, any>();
  for (const p of uniqueRemote) {
    const k = normalizeName(p.name);
    if (k && !remoteByName.has(k)) remoteByName.set(k, p);
  }
  // Never hand a live id to two different store products.
  const takenIds = new Set(linkedProducts.map((p: any) => String(p.supplier_external_id ?? "")));

  let relinked = 0;
  let retired = 0;
  const now = new Date().toISOString();
  // Supplier-side id rotations, surfaced to the admin dashboard + Telegram.
  const idAlerts: Array<{ product_id: string | null; product_name: string; surface: string; detail: string }> = [];
  const idLines: string[] = [];

  for (const prod of stale) {
    const oldId = String(prod.supplier_external_id);
    const oldRow = byExt.get(oldId);
    const match = remoteByName.get(normalizeName(prod.name));
    // ID rotation may carry an existing listing forward only when the exact
    // previous supplier row was explicitly listed by an admin. A name match
    // alone must never promote an unreviewed supplier catalogue item.
    if (oldRow?.is_listed === true && match && !takenIds.has(String(match.external_id))) {
      const newId = String(match.external_id);
      takenIds.add(newId);
      const stock = Number(match.stock ?? 0);
      await sb
        .from("products")
        .update({ supplier_external_id: newId, supplier_stock: stock })
        .eq("id", prod.id);
      prod.supplier_external_id = newId;
      prod.supplier_stock = stock;
      productsById.set(String(prod.id), prod);

      if (oldRow?.id) {
        await sb.from("supplier_products").update({ is_listed: false, product_id: null }).eq("id", oldRow.id);
        oldRow.is_listed = false;
        oldRow.product_id = null;
      }
      const newRow = byExt.get(newId);
      const wasListed = oldRow.is_listed === true && prod.is_active === true;
      if (newRow?.id) {
        await sb
          .from("supplier_products")
          .update({ is_listed: wasListed, product_id: prod.id })
          .eq("id", newRow.id);
        newRow.is_listed = wasListed;
        newRow.product_id = prod.id;
        // Same stock as the live feed → the diff below stays quiet, so a
        // re-link never fakes a restock alert.
        newRow.stock = stock;
      } else {
        const { data: ins } = await sb
          .from("supplier_products")
          .insert({
            supplier_id: s.id,
            external_id: newId,
            name: match.name,
            description: match.description ?? null,
            cost_price: match.cost_price ?? 0,
            stock,
            currency: match.currency ?? "USD",
            min_qty: match.min_qty ?? 1,
            raw: match.raw ?? null,
            is_listed: wasListed,
            product_id: prod.id,
            last_synced_at: now,
          })
          .select("*")
          .maybeSingle();
        if (ins) byExt.set(newId, ins);
      }
      relinked++;
      idAlerts.push({
        product_id: String(prod.id),
        product_name: String(prod.name ?? ""),
        surface: "supplier_id",
        detail: `${s.name}: supplier id changed ${oldId} → ${newId}. The product was re-linked automatically — please verify.`,
      });
      idLines.push(`${prod.name} · ${oldId} → ${newId} (re-linked)`);
    } else {
      // A name match exists but the previous supplier row was not an approved
      // listing → quarantine it for admin review instead of guessing.
      if (match) {
        reviewRows.push({
          supplier_id: String(s.id),
          external_id: String(match.external_id),
          reason: "rotated",
          name: String(match.name ?? prod.name ?? ""),
          cost_price: Number(match.cost_price ?? 0),
          stock: Number(match.stock ?? 0),
          product_id: String(prod.id),
          snapshot: { previous_external_id: oldId, previous_product: prod.name },
        });
        idAlerts.push({
          product_id: String(prod.id),
          product_name: String(prod.name ?? ""),
          surface: "supplier_id",
          detail: `${s.name}: supplier id changed ${oldId} → ${match.external_id}. Waiting in the review queue for your approval.`,
        });
        idLines.push(`${prod.name} · ${oldId} → ${match.external_id} (needs approval)`);
      }
      if (prod.is_active) {
        // Gone from the supplier catalogue → take it off sale instead of letting
        // a customer pay for something that can never be delivered.
        await sb.from("products").update({ is_active: false, supplier_stock: 0 }).eq("id", prod.id);
        prod.is_active = false;
        prod.supplier_stock = 0;
        productsById.set(String(prod.id), prod);
        retired++;
      }
    }
  }

  if (relinked || retired) {
    console.log(`Supplier ${s.name}: relinked ${relinked} rotated product id(s), retired ${retired}`);
  }
  if (idAlerts.length) {
    await recordSupplierAlerts(sb, idAlerts);
    try {
      const { announceSupplierNotice } = await import("@/lib/bot/engine.server");
      await announceSupplierNotice(
        s.name,
        `${idAlerts.length} product id${idAlerts.length > 1 ? "s" : ""} changed by supplier`,
        idLines.slice(0, 20).join("\n") + (idLines.length > 20 ? `\n… +${idLines.length - 20} more` : ""),
      );
    } catch (error) {
      console.error("Supplier id-change notice failed:", error);
    }
  }
  return { relinked, retired };
}


/**
 * Items the supplier no longer returns at all. Their catalogue rows are zeroed
 * and unlisted, any store product still on sale is switched off (a customer
 * could never be delivered), and the admin gets one Telegram notice per sync.
 */
async function retireMissingSupplierItems(
  sb: any,
  s: SupplierRow & Record<string, any>,
  liveIds: Set<string>,
  existingRows: any[],
  productsById: Map<string, any>,
) {
  const gone = (existingRows ?? []).filter((r: any) => !liveIds.has(String(r.external_id)));
  if (!gone.length) return { retired: 0, names: [] as string[] };

  const toClear = gone.filter((r: any) => Number(r.stock ?? 0) !== 0 || r.is_listed === true).map((r: any) => r.id);
  for (let i = 0; i < toClear.length; i += 200) {
    await sb
      .from("supplier_products")
      .update({ stock: 0, is_listed: false })
      .in("id", toClear.slice(i, i + 200));
  }

  const names: string[] = [];
  const offIds: string[] = [];
  for (const r of gone) {
    const prod = r.product_id ? productsById.get(String(r.product_id)) : null;
    if (prod && prod.is_active) {
      offIds.push(String(prod.id));
      names.push(String(prod.name ?? r.name ?? ""));
      prod.is_active = false;
      prod.supplier_stock = 0;
      productsById.set(String(prod.id), prod);
    }
  }
  for (let i = 0; i < offIds.length; i += 200) {
    await sb
      .from("products")
      .update({ is_active: false, supplier_stock: 0 })
      .in("id", offIds.slice(i, i + 200));
  }

  if (names.length) {
    try {
      const { announceSupplierNotice } = await import("@/lib/bot/engine.server");
      await announceSupplierNotice(
        s.name,
        `${names.length} product${names.length > 1 ? "s" : ""} removed by supplier — switched off`,
        names.slice(0, 20).join("\n") + (names.length > 20 ? `\n… +${names.length - 20} more` : ""),
      );
    } catch (error) {
      console.error("Removed-product notice failed:", error);
    }
  }
  return { retired: offIds.length, names };
}


async function syncSupplierCoreUnlocked(sb: any, s: SupplierRow & Record<string, any>) {
  const startedAtMs = Date.now();
  // Stamped BEFORE the API call: the database refuses to apply a response that
  // was read earlier than the snapshot it already holds, so a slow/late reply
  // can never overwrite fresher data.
  const fetchedAt = new Date().toISOString();
  let remote;
  try {
    remote = await supplierProducts(s);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    await sb.from("suppliers").update({ last_status: message }).eq("id", s.id);
    await recordSyncRun(sb, s.id, startedAtMs, false, 0, 0, message);
    return { ok: false, message, added: 0, restocked: 0 };
  }

  // Supabase returns at most 1,000 rows per request. Read every page so a large
  // catalogue never treats row 1,001+ as a brand-new product on every sync.
  const [existing, linkedProducts] = await Promise.all([
    readAllSupplierRows(sb, "supplier_products", s.id),
    readAllSupplierRows(sb, "products", s.id),
  ]);
  const byExt = new Map<string, any>((existing ?? []).map((r: any) => [String(r.external_id), r]));
  const productsById = new Map<string, any>((linkedProducts ?? []).map((r: any) => [String(r.id), r]));
  const now = fetchedAt;
  const alerts: SupplierAlert[] = [];
  const restockPosts: Array<{ product_id: string; qty: number; stock: number; event_id: string }> = [];
  const lowPosts: Array<{ product_id: string; stock: number; event_id: string }> = [];
  const pricePosts: Array<{ product_id: string; old_price: number; new_price: number; event_id: string }> = [];
  const productUpdates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  // Settings that control supplier alerts. Supplier products are never put on
  // sale automatically; only an explicit admin action may list them.
  const { data: cfgRows } = await sb
    .from("bot_settings")
    .select("key,value")
    .in("key", ["announce_low_threshold"]);
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[(r as any).key] = (r as any).value ?? "";
  const lowThresholdRaw = Number(cfg["announce_low_threshold"]);
  const lowThreshold = Number.isFinite(lowThresholdRaw) && lowThresholdRaw > 0 ? lowThresholdRaw : 5;


  // Some supplier APIs repeat the same item in one response (paging overlap,
  // variants sharing an id). Keep only the last occurrence per external_id so
  // one sync never processes — or imports — the same product twice.
  const uniqueRemote = Array.from(
    new Map(remote.filter((p) => p.external_id != null).map((p) => [String(p.external_id), p])).values(),
  );

  // Some suppliers (Canboso/FatBunny, Qamify) rotate a product's id whenever a
  // new batch lands. The stored id then points at nothing and every purchase
  // fails with "Product not found". Re-point the store product at the live id
  // by matching the product name; if the product is really gone from the
  // supplier, take it off sale instead of letting customers buy a dead link.
  // Quarantine queue rows collected during this sync (new + rotated items).
  const reviewRows: ReviewInput[] = [];
  const relinked = await relinkRotatedIds(sb, s, uniqueRemote, linkedProducts ?? [], byExt, productsById, reviewRows);

  // Every supplier row is written in a few batched upserts instead of one
  // request per product — a 250-item catalogue used to need 250 round trips,
  // which made a single sync run longer than the 15s schedule interval.
  const rowsToWrite: any[] = [];
  // Custom prices lifted because the supplier raised its cost (see below).
  const overrideBumps: { id: string; price_override: number; override_cost_base: number }[] = [];



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
      alerts.push({
        id: `${s.id}:${p.external_id}:new`,
        at: now,
        kind: "new",
        supplier: s.name,
        supplier_id: s.id,
        product: p.name,
        qty: p.stock,
        listed: false,
      });
      // Brand-new supplier item → admin review queue (quarantined, invisible
      // everywhere until an admin approves it).
      reviewRows.push({
        supplier_id: String(s.id),
        external_id: String(p.external_id),
        reason: "new",
        name: String(p.name ?? ""),
        cost_price: Number(p.cost_price ?? 0),
        price: Number(
          sellPrice(Number(p.cost_price ?? 0), {
            supplier_percent: s.markup_percent ?? null,
            supplier_fixed: s.markup_fixed ?? null,
          }),
        ),
        stock: Number(p.stock ?? 0),
        snapshot: { currency: p.currency ?? "USD", min_qty: p.min_qty ?? 1 },
      });
      continue;
    }


    // --- Custom price protection ---------------------------------------
    // A custom (override) price never follows the supplier down, but it always
    // follows the supplier UP by exactly the same amount, so a supplier cost
    // increase can never turn a sale into a loss. `override_cost_base` is the
    // supplier cost recorded when the custom price was set/last bumped.
    let overrideNow = prev.price_override;
    if (Number(prev.price_override ?? 0) > 0) {
      const newCost = Number(p.cost_price ?? 0);
      const base = prev.override_cost_base == null ? null : Number(prev.override_cost_base);
      if (base == null || !Number.isFinite(base)) {
        // First sync after the column landed — remember today's cost as the base.
        overrideBumps.push({
          id: prev.id,
          price_override: Number(prev.price_override),
          override_cost_base: newCost,
        });
        prev.override_cost_base = newCost;
      } else if (newCost - base >= 0.01) {
        overrideNow = Math.round((Number(prev.price_override) + (newCost - base)) * 100) / 100;
        overrideBumps.push({ id: prev.id, price_override: overrideNow, override_cost_base: newCost });
        prev.price_override = overrideNow;
        prev.override_cost_base = newCost;
      }
    }

    const wasOut = Number(prev.stock ?? 0) <= 0;

    const nowIn = Number(p.stock ?? 0) > 0;
    const grew = Number(p.stock ?? 0) > Number(prev.stock ?? 0);
    // Stable for overlapping cron/webhook runs that read the same snapshot.
    // The delivery claim then guarantees exactly one Telegram announcement.
    const transitionId = `${s.id}:${p.external_id}:${prev.last_synced_at ?? "initial"}:${Number(prev.stock ?? 0)}:${Number(p.stock ?? 0)}`;

    if (prev.is_listed && prev.product_id) {
      const price = sellPrice(p.cost_price, {
        price_override: overrideNow,
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
      };
      // On/off is the admin's decision — a sync must never switch a product
      // back on. Disabling the whole supplier still takes its products off sale.
      if (!s["is_enabled"]) productPatch.is_active = false;
      // Only overwrite the rich fields when the supplier actually sent them —
      // otherwise a sparse sync response would wipe the banner/notes the admin
      // (or an earlier, richer response) already stored.
      // Admin-uploaded banner always wins: only take the supplier image when
      // the product still has no image of its own.
      const currentImage = productsById.get(String(prev.product_id))?.image_url ?? null;
      if (d.image_url && !currentImage) productPatch.image_url = d.image_url;
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

      // Stock dropping inside the alert zone (or hitting zero) gets its own card.
      // Any real drop that leaves the product at/below the threshold counts —
      // not only the first crossing — so "almost gone" style updates (3 → 2)
      // still reach the channel. The per-product cooldown stops repeats.
      const prevStock = Number(prev.stock ?? 0);
      const nowStock = Number(p.stock ?? 0);
      if (nowStock <= 0 && prevStock > 0) {
        lowPosts.push({ product_id: prev.product_id, stock: 0, event_id: `low:${transitionId}` });
      } else if (nowStock > 0 && nowStock < prevStock && nowStock <= lowThreshold) {
        lowPosts.push({ product_id: prev.product_id, stock: nowStock, event_id: `low:${transitionId}` });
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

  // ONE ATOMIC WRITE. Catalogue rows, the customer-visible product stock/price
  // and the supplier's sync stamp all land in a single transaction, so a run
  // that the platform cuts short can never leave half the data written. The
  // function also refuses stale responses (see `fetchedAt` above).
  const productPayload = productUpdates.map(({ id, patch }) => ({
    id,
    name: (patch["name"] as string | undefined) ?? null,
    description: (patch["description"] as string | null | undefined) ?? null,
    has_description: Object.prototype.hasOwnProperty.call(patch, "description"),
    price: (patch["price"] as number | undefined) ?? null,
    supplier_stock: (patch["supplier_stock"] as number | undefined) ?? null,
    is_active: (patch["is_active"] as boolean | undefined) ?? null,
    image_url: (patch["image_url"] as string | undefined) ?? null,
    delivery_time: (patch["delivery_time"] as string | undefined) ?? null,
    important_note: (patch["important_note"] as string | undefined) ?? null,
    quick_guide: (patch["quick_guide"] as string | undefined) ?? null,
    details: (patch["details"] as unknown) ?? null,
  }));
  // Persist lifted custom prices first: the snapshot below writes the new
  // product price that was computed from them.
  for (const b of overrideBumps) {
    await sb
      .from("supplier_products")
      .update({ price_override: b.price_override, override_cost_base: b.override_cost_base })
      .eq("id", b.id);
  }
  const status = `Synced ${uniqueRemote.length} products${relinked.relinked ? ` · ${relinked.relinked} id relinked` : ""}${relinked.retired ? ` · ${relinked.retired} delisted` : ""}`;

  const { data: applied, error: applyError } = await sb.rpc("apply_supplier_snapshot", {
    _supplier_id: s.id,
    _fetched_at: fetchedAt,
    _rows: rowsToWrite.map((r) => ({
      external_id: String(r.external_id),
      name: r.name ?? null,
      description: r.description ?? null,
      cost_price: Number(r.cost_price ?? 0),
      stock: Number(r.stock ?? 0),
      currency: r.currency ?? "USD",
      min_qty: Number(r.min_qty ?? 1),
      raw: r.raw ?? null,
    })),
    _product_updates: productPayload,
    _status: status,
  });
  if (applyError) {
    await recordSyncRun(sb, s.id, startedAtMs, false, uniqueRemote.length, 0, applyError.message);
    throw new Error(`Could not save ${s.name} catalogue: ${applyError.message}`);
  }
  if ((applied as any)?.stale) {
    // A newer sync already wrote fresher numbers — drop this response silently.
    await recordSyncRun(sb, s.id, startedAtMs, true, uniqueRemote.length, 0, "stale response discarded");
    return {
      ok: true,
      message: "Newer data already applied",
      added: 0,
      restocked: 0,
      checked: uniqueRemote.length,
      priceChanges: 0,
      lowOrOut: 0,
    };
  }
  // Keep the in-memory copies in step with what the database now holds.
  for (const { id, patch } of productUpdates) {
    const current = productsById.get(id);
    if (current) productsById.set(id, { ...current, ...patch });
  }
  await recordSyncRun(
    sb,
    s.id,
    startedAtMs,
    true,
    uniqueRemote.length,
    productUpdates.length + restockPosts.length + lowPosts.length + pricePosts.length,
    null,
  );



  // The manual admin sync already has an authenticated admin client. Reuse it
  // instead of requiring the separately configured service-role secret.
  await pushAlerts(alerts, sb);

  // Products the supplier no longer offers → off sale + admin notice.
  await retireMissingSupplierItems(
    sb,
    s,
    new Set(uniqueRemote.map((p) => String(p.external_id))),
    existing ?? [],
    productsById,
  ).catch((error) => {
    console.error("Retire missing supplier items failed:", error);
    return { retired: 0, names: [] as string[] };
  });


  // Quarantine: new / rotated supplier items wait for an admin decision.
  if (reviewRows.length) {
    const { enqueueReview } = await import("./review.server");
    await enqueueReview(reviewRows, sb);
  }



  const added = alerts.filter((a) => a.kind === "new").length;
  const restocked = restockPosts.length;


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
  const { data: sups } = await db
    .from("suppliers")
    .select("*")
    .eq("is_enabled", true)
    // Longest-waiting supplier first: every supplier gets its turn even when a
    // single invocation only has room for a couple of them.
    .order("last_synced_at", { ascending: true, nullsFirst: true });

  // Delivery FIRST. Catalogue polling is the heavy part of a run; when it used
  // to go first, a slow supplier API could eat the whole invocation and the
  // queued Telegram cards were never sent (queues sat full for hours).
  const delivery = await drainAllNotifications(db).catch((error) => {
    console.error("Notification drain failed:", error);
    return { sent: 0, failed: 1 };
  });

  // Keep push webhooks registered on their own — no admin button needed, but
  // only every few minutes: re-checking on every 15s tick used to spend the
  // whole invocation budget before a single catalogue was read.
  if (await dueEvery(db, "supplier_webhook_check_at", WEBHOOK_CHECK_MS)) {
    const { ensureSupplierWebhook } = await import("./webhook.server");
    await Promise.allSettled(
      (sups ?? []).map((s: any) =>
        withTimeout(ensureSupplierWebhook(db, s), 6_000, `${s.name} webhook check`).catch((error) => {
          console.error(`Webhook registration failed for ${s.name}:`, error);
        }),
      ),
    );
  }

  // Supplier announcements (only for APIs that expose them) go out as bot
  // messages; probing is cheap and self-disables for suppliers without one.
  await syncSupplierAnnouncements(db, sups ?? []).catch((error) =>
    console.error("Supplier announcement sync failed:", error),
  );

  let added = 0;
  let restocked = 0;
  let checked = 0;
  let priceChanges = 0;
  let lowOrOut = 0;
  let failedSuppliers = 0;
  let lastError = "";
  // Only a slice of the suppliers per invocation, each with its own timeout:
  // reading four full catalogues (hundreds of products) in one worker run is
  // what used to blow the platform's CPU/subrequest budget, killing the run
  // before anything was written. One supplier going down never stops the rest.
  const batch = (sups ?? []).slice(0, SUPPLIERS_PER_RUN);
  const results = await Promise.allSettled(
    batch.map((s: any) => withTimeout(syncSupplierCore(db, s), SUPPLIER_TIMEOUT_MS, `${s.name} sync`)),
  );


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
/** Minimum gap between two fast polls of the same push-less supplier. */
const FAST_POLL_MS = 15_000;

/**
 * MailReader and the FatBunny/Canboso buyer API expose no webhook endpoint
 * (verified against both live APIs), so they can never push a stock change to
 * us. To make them behave like the webhook suppliers we poll them on every
 * scheduler tick and deliver whatever they produce right away.
 */
async function fastPollPushlessSuppliers(db: any) {
  const { data: sups } = await db
    .from("suppliers")
    .select("*")
    .eq("is_enabled", true)
    .order("last_synced_at", { ascending: true, nullsFirst: true });
  const api = await import("./api.server");
  const due: any[] = [];
  for (const s of sups ?? []) {
    if (api.supplierSupportsWebhooks(s)) continue; // push already covers these
    if (due.length >= SUPPLIERS_PER_RUN) break; // keep each invocation small
    const key = `supplier_fastpoll_at:${String(s.id)}`;
    const { data: row } = await db.from("bot_settings").select("value").eq("key", key).maybeSingle();
    const at = Date.parse(String((row as any)?.value ?? ""));
    if (Number.isFinite(at) && Date.now() - at < FAST_POLL_MS) continue;
    await db.from("bot_settings").upsert({ key, value: new Date().toISOString() }, { onConflict: "key" });
    due.push(s);
  }
  if (!due.length) return { polled: 0 };

  await Promise.allSettled(
    due.map((s) => withTimeout(syncSupplierCore(db, s), SUPPLIER_TIMEOUT_MS, `${s.name} sync`)),
  );
  // Anything the poll produced should reach Telegram in the same tick.
  await drainAllNotifications(db).catch(() => ({ sent: 0, failed: 1 }));
  return { polled: due.length };
}

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
    const startedAt = Date.now();
    const delivery = await drainAllNotifications(db).catch(() => ({ sent: 0, failed: 1 }));
    // Suppliers that push changes to us (Vexoran-style webhooks) are already
    // realtime. The rest have no push API at all, so they only look realtime
    // if we keep polling them on every tick instead of once per window.
    // Alerts come first: if delivery already used the request budget, polling
    // waits for the next tick instead of getting this request killed.
    if (Date.now() - startedAt > DRAIN_BUDGET_MS - 2_000) return { skipped: true, ...delivery, polled: 0 };
    const fast = await fastPollPushlessSuppliers(db).catch((error) => {
      console.error("Fast poll failed:", error);
      return { polled: 0 };
    });
    return { skipped: true, ...delivery, ...fast };
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
