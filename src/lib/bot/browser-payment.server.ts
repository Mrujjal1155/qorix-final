import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { browserGateway, browserPaymentInput, browserPaymentOpen, type BrowserPaymentPreview } from "./browser-payment";

const db = supabaseAdmin as any;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export async function readBrowserPayment(token: string) {
  browserPaymentInput.parse({ token });
  const { data: link, error } = await db.from("bot_browser_payments").select("*").eq("token_hash", digest(token)).maybeSingle();
  if (error || !link) throw new Error("This payment link is invalid or unavailable.");
  const { data: user } = await db.from("bot_users").select("is_banned").eq("telegram_id", link.telegram_id).maybeSingle();
  if (!user || user.is_banned) throw new Error("This payment is unavailable.");
  return link;
}

export async function issueBrowserPayment(tid: number, snapshot: Record<string, unknown>, total: number, orders: unknown[], previous?: string) {
  if (previous) {
    const old = await readBrowserPayment(previous).catch(() => null);
    if (old && Number(old.telegram_id) === tid && browserPaymentOpen(old)) return { ...old, token: previous };
  }
  const token = randomBytes(32).toString("hex");
  const { data, error } = await db.rpc("issue_bot_browser_payment", { _telegram_id: tid, _hash: digest(token), _snapshot: snapshot, _total: total, _orders: orders });
  if (error || !data) throw new Error("An existing payment may still be open. Complete or cancel it first.");
  return { ...data, snapshot, total, token };
}

export async function browserPaymentPreview(token: string): Promise<BrowserPaymentPreview> {
  const link = await readBrowserPayment(token);
  const { data: orders } = await db.from("orders").select("order_no,product_name,quantity,total,status").eq("telegram_id", link.telegram_id).eq("meta->>browser_link_id", link.id).order("order_no").limit(100);
  let deposit: any = null;
  if (link.deposit_id) {
    const { data } = await db.from("binance_deposits").select("id,kind,network,address,amount_usdt,status,expires_at").eq("id", link.deposit_id).eq("telegram_id", link.telegram_id).maybeSingle();
    deposit = data;
  }
  const paid = deposit?.status === "credited";
  const status = paid ? "paid" : !browserPaymentOpen(link) ? "expired" : deposit && deposit.status !== "pending" ? "failed" : link.status === "pending" && !deposit?.address ? "starting" : link.status;
  const { webBrowserGateways } = await import("./engine.server");
  return {
    status, total: Number(link.total), expires_at: String(link.expires_at),
    orders: (orders ?? []).map((o: any) => ({ number: Number(o.order_no), name: String(o.product_name), quantity: Number(o.quantity), total: Number(o.total), status: String(o.status) })),
    gateways: status === "ready" ? await webBrowserGateways() : [],
    deposit: deposit && status === "pending" ? { kind: String(deposit.kind), network: deposit.network ? String(deposit.network) : null, address: String(deposit.address ?? ""), amount: Number(deposit.amount_usdt), gateway: String(link.gateway) } : null,
  };
}

export async function startBrowserPayment(token: string, gateway: string) {
  const gw = browserGateway.parse(gateway);
  const link = await readBrowserPayment(token);
  if (!browserPaymentOpen(link)) throw new Error("This payment link expired or was cancelled.");
  if (link.status === "pending") return browserPaymentPreview(token);
  const { webBrowserGateways, webBrowserStockCheck, webStartDeposit } = await import("./engine.server");
  if (!(await webBrowserGateways()).some(g => g.id === gw)) throw new Error("This payment method is unavailable.");
  await webBrowserStockCheck(link.snapshot);
  const { data: claimed, error } = await db.from("bot_browser_payments").update({ status: "starting", gateway: gw }).eq("id", link.id).eq("status", "ready").gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
  if (error || !claimed) throw new Error("Payment creation is already in progress. Refresh this page; do not pay twice.");
  // Never release an uncertain provider attempt: interruption must not create a second invoice.
  const result = await webStartDeposit(Number(link.telegram_id), gw, Number(link.total), { ...link.snapshot, total: Number(link.total), browser_link_id: link.id });
  if ("error" in result || !result.row) throw new Error("Payment could not be opened. Contact support before trying another payment.");
  const bound = await db.rpc("bind_bot_browser_payment", { _id: link.id, _deposit_id: result.row.id });
  if (bound.error) throw new Error("Payment needs review. Do not pay until it appears on this page.");
  return browserPaymentPreview(token);
}

export async function verifyBrowserPayment(token: string, txid: string) {
  const link = await readBrowserPayment(token);
  if (!browserPaymentOpen(link) || link.status !== "pending" || !link.deposit_id) return browserPaymentPreview(token);
  const { webVerifyBrowserDeposit } = await import("./engine.server");
  await webVerifyBrowserDeposit(Number(link.telegram_id), String(link.deposit_id), txid);
  return browserPaymentPreview(token);
}