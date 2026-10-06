// Server-only PayKori gateway (https://checkout.paykori.online/api/).
// Used as a drop-in alternative to EPS: the same checkout / bot flows call
// initializePayment / verifyTransaction in eps.server, which route here when
// PayKori is the active BDT gateway. The API key never leaves the server.

const BASE = "https://checkout.paykori.online/api";

type Json = Record<string, any>;

async function call(apiKey: string, path: string, body: Json) {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false as const, status: 0, error: "PayKori is unreachable. Please try again.", data: null as Json | null };
  }
  const text = await res.text();
  let data: Json | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-json */
  }
  if (!res.ok || !data) {
    console.error(`PayKori ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
    const msg = pick(data, ["message", "error", "msg"]) ?? `PayKori error (HTTP ${res.status}). Check the API key.`;
    return { ok: false as const, status: res.status, error: msg.slice(0, 200), data };
  }
  return { ok: true as const, status: res.status, error: null, data };
}

/** Find a string value by key anywhere in a (shallow-nested) object. */
function pick(obj: any, keys: string[], depth = 0): string | null {
  if (!obj || typeof obj !== "object" || depth > 3) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const r = pick(v, keys, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

const URL_KEYS = ["payment_url", "paymentUrl", "checkout_url", "checkoutUrl", "redirect_url", "redirectUrl", "url", "link"];
const TX_KEYS = ["transaction_id", "transactionId", "trx_id", "invoice_id", "payment_id", "id"];

export async function paykoriCreate(
  apiKey: string,
  input: { amountBdt: number; successUrl: string; cancelUrl: string; email: string; phone: string; orderId: string },
) {
  const r = await call(apiKey, "payment/create", {
    amount: input.amountBdt.toFixed(2),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { email: input.email, phone: input.phone, order_id: input.orderId },
    email: input.email,
    phone: input.phone,
    order_id: input.orderId,
  });
  if (!r.ok) return { ok: false as const, error: r.error };
  const url = pick(r.data, URL_KEYS);
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false as const, error: pick(r.data, ["message", "error"]) ?? "PayKori did not return a payment link." };
  }
  return { ok: true as const, url, transactionId: pick(r.data, TX_KEYS) };
}

export async function paykoriVerify(apiKey: string, transactionId: string, expectedOrderId: string) {
  const tid = transactionId.trim();
  if (!tid) return { ok: false as const, error: "Payment not finished yet — no PayKori transaction id received." };
  const r = await call(apiKey, "payment/verify", { transaction_id: tid });
  if (!r.ok) return { ok: false as const, error: r.error };
  const d = r.data;
  // A transaction that belongs to another order must never settle this one.
  const orderId = pick(d, ["order_id", "orderId"]);
  if (orderId && expectedOrderId && orderId !== expectedOrderId) {
    console.error(`PayKori order mismatch: tx ${tid} belongs to ${orderId}, not ${expectedOrderId}`);
    return { ok: false as const, error: "This payment belongs to a different order." };
  }
  return {
    ok: true as const,
    info: {
      status: (pick(d, ["status", "payment_status", "paymentStatus"]) ?? "").toLowerCase(),
      amount: Number(pick(d, ["amount", "paymentAmount", "payment_amount", "total_amount"]) ?? 0) || 0,
      merchantTransactionId: orderId ?? expectedOrderId,
      epsTransactionId: pick(d, ["transaction_id", "transactionId", "trx_id"]) ?? tid,
      financialEntity: `PayKori${pick(d, ["paymentMethod", "payment_method", "method"]) ? ` · ${pick(d, ["paymentMethod", "payment_method", "method"])}` : ""}`,
      errorMessage: pick(d, ["message"]) ?? "",
    },
  };
}

/** Connection test: create a ৳10 link (nothing is charged unless someone pays it). */
export async function paykoriTest(apiKey: string, origin: string) {
  if (!apiKey.trim()) return { ok: false, message: "API key is empty." };
  const r = await paykoriCreate(apiKey.trim(), {
    amountBdt: 10,
    successUrl: `${origin}/api/public/eps/return?state=cancel`,
    cancelUrl: `${origin}/api/public/eps/return?state=cancel`,
    email: "test@qorixlab.com",
    phone: "01700000000",
    orderId: `TEST-${Date.now()}`,
  });
  return r.ok
    ? { ok: true, message: "Connection OK — PayKori created a test payment link." }
    : { ok: false, message: `Connection failed: ${r.error}` };
}
