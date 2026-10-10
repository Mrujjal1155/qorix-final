// Telegram-bot pre-orders: paid up front from the wallet, then delivered
// strictly in queue order (oldest first) as soon as stock arrives.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage } from "@/lib/telegram.server";

const db = supabaseAdmin as any;

export const PREORDER_STATUS = "preorder";
const PROCESSING = "preorder_processing";

/** Unit price a pre-order buyer pays: base price + admin-set percent. */
export function preorderUnitPrice(price: number, percent: number) {
  const pct = Math.max(0, Number(percent) || 0);
  return Math.round(Number(price) * (1 + pct / 100) * 100) / 100;
}

/** Refund a still-queued pre-order to the buyer's wallet. Safe against double taps. */
export async function cancelPreorder(chatId: number, orderId: string) {
  const { data: row } = await db
    .from("orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("telegram_id", chatId)
    .eq("status", PREORDER_STATUS)
    .select("*")
    .maybeSingle();
  if (!row) return { ok: false as const };
  const amount = Number(row.total ?? 0);
  if (amount > 0) {
    await db.rpc("bot_user_credit", {
      _telegram_id: chatId,
      _amount: amount,
      _type: "refund",
      _method: "wallet",
      _reference: `preorder-cancel:${row.id}`,
      _note: `Pre-order #${row.order_no} cancelled`,
    });
  }
  return { ok: true as const, order: row, amount };
}

let running: Promise<number> | null = null;

/** Deliver queued pre-orders for one product (or every product with a queue). */
export async function fulfillPreorders(productId?: string): Promise<number> {
  // One drain at a time per isolate keeps the serial order intact.
  while (running) await running.catch(() => 0);
  running = (async () => {
    let q = db.from("orders").select("product_id").eq("status", PREORDER_STATUS).limit(500);
    if (productId) q = q.eq("product_id", productId);
    const { data } = await q;
    const ids = [...new Set(((data ?? []) as any[]).map((r) => String(r.product_id)).filter(Boolean))];
    let done = 0;
    for (const id of ids) {
      try {
        done += await drainProduct(id);
      } catch (e) {
        console.error("[preorder] drain failed", id, e);
      }
    }
    return done;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

async function drainProduct(productId: string): Promise<number> {
  const { data: p } = await db.from("products").select("*").eq("id", productId).maybeSingle();
  if (!p) return 0;
  let done = 0;
  for (let guard = 0; guard < 200; guard++) {
    const { data: next } = await db
      .from("orders")
      .select("*")
      .eq("product_id", productId)
      .eq("status", PREORDER_STATUS)
      .order("created_at", { ascending: true })
      .order("order_no", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next) break;
    // Lock this row; a parallel drain that lost the race simply stops.
    const { data: locked } = await db
      .from("orders")
      .update({ status: PROCESSING })
      .eq("id", next.id)
      .eq("status", PREORDER_STATUS)
      .select("*")
      .maybeSingle();
    if (!locked) break;
    const ok = await deliverOne(p, locked).catch((e) => {
      console.error("[preorder] deliver failed", locked.id, e);
      return false;
    });
    if (!ok) {
      // Not enough stock yet: back to the front of the queue, keep the serial.
      await db.from("orders").update({ status: PREORDER_STATUS }).eq("id", locked.id).eq("status", PROCESSING);
      break;
    }
    done++;
  }
  return done;
}

async function deliverOne(p: any, o: any): Promise<boolean> {
  const qty = Math.max(1, Number(o.quantity ?? 1));
  const chatId = Number(o.telegram_id);
  let items: string[] = [];

  if (p.delivery_type === "manual") {
    if (p.manual_stock_limited) {
      const { data: took } = await db.rpc("take_manual_stock", { _pid: p.id, _qty: qty });
      if (took === false) return false;
    }
    await db
      .from("orders")
      .update({ status: "pending", meta: { ...(o.meta ?? {}), manual: true, preorder_released_at: new Date().toISOString() } })
      .eq("id", o.id);
    const { notifyAdmins } = await import("@/lib/bot/engine.server");
    await notifyAdmins(
      `🕐 <b>Pre-order ready for manual delivery — order #${o.order_no}</b>\nUser: <code>${chatId}</code>\n${qty}× ${p.name}`,
      [[{ text: "🚚 Deliver now", callback_data: `adm:od:${o.id}` }], [{ text: "❌ Cancel & refund", callback_data: `adm:oc:${o.id}` }]],
    ).catch(() => {});
    await sendMessage(chatId, `⏳ Your pre-order <b>#${o.order_no}</b> (${p.name}) is now being prepared by our team.`).catch(() => {});
    return true;
  }

  if (p.supplier_id && p.supplier_external_id) {
    let externalId = String(p.supplier_external_id);
    let stock = Number(p.supplier_stock ?? 0);
    try {
      const { refreshLiveStock } = await import("@/lib/suppliers/live-stock.server");
      const live = await refreshLiveStock(String(p.id), 8000);
      if (live) {
        externalId = live.external_id;
        stock = live.stock;
      }
    } catch {
      /* keep stored values */
    }
    if (stock < qty) return false;
    const { data: sup } = await db.from("suppliers").select("*").eq("id", p.supplier_id).maybeSingle();
    if (!sup?.is_enabled) return false;
    const { supplierOrder } = await import("@/lib/suppliers/api.server");
    try {
      const res = await supplierOrder(sup as any, externalId, qty, `qorix-pre-${o.id}`);
      items = res.items ?? [];
    } catch (e) {
      console.error("[preorder] supplier order failed", o.id, e);
      return false;
    }
    if (!items.length) {
      // Supplier may have charged; never retry blindly — hand to admin.
      await db.from("orders").update({ status: "pending", meta: { ...(o.meta ?? {}), preorder_supplier_empty: true } }).eq("id", o.id);
      const { notifyAdmins } = await import("@/lib/bot/engine.server");
      await notifyAdmins(
        `⚠️ <b>Pre-order #${o.order_no}</b>: supplier returned no items. Please check and deliver manually.`,
        [[{ text: "🚚 Deliver now", callback_data: `adm:od:${o.id}` }]],
      ).catch(() => {});
      return true;
    }
  } else {
    const { data: claimed } = await db.rpc("claim_stock_items", { _product_id: p.id, _qty: qty, _sold_to: chatId });
    const rows = (claimed ?? []) as any[];
    if (rows.length < qty) {
      if (rows.length)
        await db.from("stock_items").update({ is_sold: false, sold_to: null, sold_at: null }).in("id", rows.map((r) => r.id));
      return false;
    }
    items = rows.map((r) => String(r.content));
  }

  await db
    .from("orders")
    .update({ status: "completed", delivered_content: items.join("\n---\n"), meta: { ...(o.meta ?? {}), preorder_delivered_at: new Date().toISOString() } })
    .eq("id", o.id);
  await sendMessage(chatId, `✅ <b>Your pre-order #${o.order_no} is ready!</b>\n${qty}× ${p.name} — delivering now.`).catch(() => {});
  const { deliverItemsToChat } = await import("@/lib/bot/deliver-items.server");
  await deliverItemsToChat(chatId, p.name, items, { orderNo: o.order_no, orderId: o.id }).catch((e) =>
    console.error("[preorder] send failed", o.id, e),
  );
  return true;
}
