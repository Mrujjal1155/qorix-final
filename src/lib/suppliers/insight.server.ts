import type { SupplierProduct, SupplierRow } from "./api.server";

export function isInsightStore(s: SupplierRow) {
  return s.key === "insightstore" || /^https:\/\/api\.insightxpro\.store(?:\/|$)/i.test(s.base_url);
}

/** One authenticated request; never follow redirects or retry a purchase. */
export async function insightRequest(s: SupplierRow, path: string, body?: unknown) {
  const base = new URL(s.base_url);
  if (base.origin !== "https://api.insightxpro.store" || base.username || base.password || base.search || base.hash || !["/", "/api/v1", "/api/v1/"].includes(base.pathname)) {
    throw new Error("Unsupported Insight Store address");
  }
  const key = s.api_key?.trim() || process.env["INSIGHTSTORE_API_KEY"]?.trim();
  if (!key) throw new Error("Add the Insight Store API key before testing");
  const response = await fetch(`${base.origin}/api/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: { "X-API-Key": key, "Content-Type": "application/json", Accept: "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status >= 300 && response.status < 400) throw new Error("Insight Store redirected the request; check the saved address");
  const data = await response.json();
  if (!response.ok || data?.error) {
    const error = new Error(`Insight Store request failed (HTTP ${response.status})`);
    Object.assign(error, { deliveryOutcome: response.status >= 400 && response.status < 500 && response.status !== 408 ? "rejected" : "unknown" });
    throw error;
  }
  return data;
}

export async function insightBalance(s: SupplierRow) {
  const data = await insightRequest(s, "balance");
  const balance = Number(data.balance_usdt);
  if (!Number.isFinite(balance) || balance < 0) throw new Error("Invalid Insight Store balance response");
  return { balance, currency: "USDT" };
}

export async function insightProducts(s: SupplierRow): Promise<SupplierProduct[]> {
  const data = await insightRequest(s, "products?include_unavailable=1");
  if (!Array.isArray(data.products)) throw new Error("Invalid Insight Store catalogue response");
  return data.products.map((p: any) => {
    const cost = Number(p.base_price_usdt);
    if (!Number.isSafeInteger(p.id) || p.id <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(Number(p.stock)) || Number(p.stock) < 0 || typeof p.available !== "boolean") {
      throw new Error("Invalid Insight Store product response");
    }
    return {
      external_id: String(p.id), name: String(p.name ?? p.id),
      description: p.description == null ? (p.description_text ?? null) : String(p.description),
      cost_price: cost, stock: p.available === false ? 0 : p.unlimited === true ? 999999 : Number(p.stock),
      currency: "USDT", min_qty: 1, raw: p,
    };
  });
}

function insightDelivery(order: any, productId: number, qty: number) {
  const codes = [order?.codes, order?.delivered_codes, order?.coupons].find((value) => Array.isArray(value) && value.length);
  const id = Number(order?.order_id ?? order?.id);
  if (order?.test || order?.status !== "completed" || order?.error || Number(order?.product_id) !== productId || Number(order?.quantity) !== qty || !Array.isArray(codes) || codes.length !== qty || codes.some((code: unknown) => typeof code !== "string" || !code.trim() || code.startsWith("TEST-")) || !Number.isSafeInteger(id) || id <= 0) return null;
  return { code: String(id), items: codes as string[] };
}

/** Read-only recovery: a retry may retrieve an existing purchase, never create one. */
export async function insightRecoverDelivery(s: SupplierRow, externalId: string, qty: number, reference?: string) {
  const productId = Number(externalId);
  if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(qty) || qty <= 0) throw new Error("Invalid Insight Store recovery request");
  if (!reference?.trim()) throw new Error("Original purchase reference is unavailable. Provider reconciliation is required; no new purchase attempted");
  const history = await insightRequest(s, "orders");
  if (!Array.isArray(history?.orders)) throw new Error("Invalid Insight Store history response; no new purchase attempted");
  const matches = history.orders.filter((o: any) => o?.idempotency_key === reference);
  if (matches.length !== 1) throw new Error("Original purchase is not uniquely present in provider history; no new purchase attempted");
  const id = Number(matches[0]?.order_id ?? matches[0]?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid original purchase identity; no new purchase attempted");
  const order = (await insightRequest(s, `orders/${id}`)).order;
  if (Number(order?.order_id ?? order?.id) !== id || order?.idempotency_key !== reference || Number(order?.product_id) !== productId || Number(order?.quantity) !== qty) throw new Error("Provider purchase does not match this order; no new purchase attempted");
  const delivery = insightDelivery(order, productId, qty);
  if (delivery) return delivery;
  if (await insightRefunded(s, order)) throw new Error("Original purchase failed and was fully refunded by the supplier. No delivery exists; a separately approved new purchase is required");
  throw new Error("Original purchase has no verified complete delivery; no new purchase attempted");
}

/** A failed order is safe to replace only after the provider proves its full debit was refunded. */
async function insightRefunded(s: SupplierRow, order: any) {
  const amount = Number(order?.amount_usdt ?? order?.total_usdt);
  const id = String(order?.order_id ?? order?.id);
  if (order?.status !== "failed" || order?.test || !Number.isFinite(amount) || amount <= 0 || [order?.codes, order?.delivered_codes, order?.coupons].some((v) => Array.isArray(v) && v.length)) return false;
  const balance = await insightRequest(s, "balance");
  const transactions = Array.isArray(balance?.recent_transactions) ? balance.recent_transactions : [];
  const matches = transactions.filter((t: any) => t.ref_type === "api_order" && String(t.ref_id) === id);
  const debit = matches.filter((t: any) => t.kind === "order_debit");
  const refund = matches.filter((t: any) => t.kind === "refund");
  return debit.length === 1 && refund.length === 1 && Number(debit[0]?.amount_usdt) === -amount && Number(refund[0]?.amount_usdt) === amount;
}

export async function insightOrder(s: SupplierRow, externalId: string, qty: number, reference: string) {
  const productId = Number(externalId);
  if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(qty) || qty <= 0 || !reference.trim()) throw new Error("Invalid Insight Store order request");
  let key = reference;
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await insightRequest(s, "orders", { product_id: productId, quantity: qty, idempotency_key: key });
    let order = data.order;
    const delivery = insightDelivery(order, productId, qty);
    if (delivery) return delivery;
    const id = Number(order?.order_id ?? order?.id);
    // No second purchase for a timeout, partial delivery, mismatched order or test response.
    const hasCodes = [order?.codes, order?.delivered_codes, order?.coupons].some((v) => Array.isArray(v) && v.length);
    if (!hasCodes && !order?.test && Number.isSafeInteger(id) && id > 0 && Number(order?.product_id) === productId && Number(order?.quantity) === qty && ["pending", "processing", "failed"].includes(order?.status)) {
      order = (await insightRequest(s, `orders/${id}`)).order;
      if (Number(order?.order_id ?? order?.id) === id && Number(order?.product_id) === productId && Number(order?.quantity) === qty) {
        const recovered = insightDelivery(order, productId, qty);
        if (recovered) return recovered;
        if (attempt === 0 && await insightRefunded(s, order)) {
          key = `${reference}:refunded:${id}`;
          continue;
        }
      }
    }
    break;
  }
  throw new Error("Insight Store delivery needs review; do not place another purchase");
}