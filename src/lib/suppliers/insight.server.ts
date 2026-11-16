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

export async function insightOrder(s: SupplierRow, externalId: string, qty: number, reference: string) {
  const productId = Number(externalId);
  if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(qty) || qty <= 0 || !reference.trim()) throw new Error("Invalid Insight Store order request");
  const data = await insightRequest(s, "orders", { product_id: productId, quantity: qty, idempotency_key: reference });
  const order = data.order;
  const codes = Array.isArray(order?.codes) && order.codes.length ? order.codes : order?.delivered_codes;
  if (order?.test || order?.status !== "completed" || order?.error || Number(order?.product_id) !== productId || Number(order?.quantity) !== qty || !Array.isArray(codes) || codes.length !== qty || codes.some((code: unknown) => typeof code !== "string" || !code.trim() || code.startsWith("TEST-"))) {
    throw new Error("Insight Store delivery needs review; do not place another purchase");
  }
  const id = order.order_id ?? order.id;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid Insight Store order reference; delivery needs review");
  return { code: String(id), items: codes as string[] };
}