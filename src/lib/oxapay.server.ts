// Server-only OxaPay merchant API (https://docs.oxapay.com).
// The merchant API key never leaves the server. A webhook or redirect is only
// a hint: every credit re-reads the payment from OxaPay first.

import { createHmac, timingSafeEqual } from "crypto";
import { oxapayIsOn } from "@/lib/oxapay";

const BASE = "https://api.oxapay.com/v1";
type Json = Record<string, any>;

export function oxapayKey(settings: Record<string, string>) {
  return String(settings["oxapay_api_key"] || process.env["OXAPAY_MERCHANT_KEY"] || "").trim();
}

/** Usable only when the admin switched it on AND a key exists. */
export function oxapayEnabled(settings: Record<string, string>) {
  return oxapayIsOn(settings) && !!oxapayKey(settings);
}

async function call(apiKey: string, method: "GET" | "POST", path: string, body?: Json) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { merchant_api_key: apiKey, "Content-Type": "application/json", Accept: "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false as const, error: "OxaPay is unreachable. Please try again.", data: null as Json | null };
  }
  const text = await res.text();
  let json: Json | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-json */
  }
  const status = Number(json?.["status"] ?? res.status);
  if (!res.ok || !json || status !== 200) {
    console.error(`OxaPay ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
    const msg = json?.["error"]?.["message"] || json?.["message"] || `OxaPay error (HTTP ${res.status}).`;
    return { ok: false as const, error: String(msg).slice(0, 200), data: json };
  }
  return { ok: true as const, error: null, data: (json["data"] ?? {}) as Json };
}

export async function oxapayCreateInvoice(
  apiKey: string,
  input: { amountUsd: number; orderId: string; callbackUrl: string; returnUrl: string; email?: string; description: string },
) {
  const r = await call(apiKey, "POST", "/payment/invoice", {
    amount: Number(input.amountUsd.toFixed(2)),
    currency: "USD",
    lifetime: 60,
    fee_paid_by_payer: 0,
    under_paid_coverage: 0,
    mixed_payment: false,
    callback_url: input.callbackUrl,
    return_url: input.returnUrl,
    order_id: input.orderId,
    ...(input.email ? { email: input.email } : {}),
    description: input.description.slice(0, 200),
    sandbox: false,
  });
  if (!r.ok) return { ok: false as const, error: r.error };
  const url = String(r.data["payment_url"] ?? "");
  const trackId = String(r.data["track_id"] ?? "");
  if (!/^https:\/\//i.test(url) || !trackId) return { ok: false as const, error: "OxaPay did not return a payment link." };
  return { ok: true as const, url, trackId };
}

export type OxapayInfo = { trackId: string; status: string; amount: number; currency: string; orderId: string; coin: string; txHash: string };

export async function oxapayPaymentInfo(apiKey: string, trackId: string) {
  const id = String(trackId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false as const, error: "Invalid track id." };
  const r = await call(apiKey, "GET", `/payment/${encodeURIComponent(id)}`);
  if (!r.ok) return { ok: false as const, error: r.error };
  const d = r.data;
  const tx = Array.isArray(d["txs"]) ? d["txs"][0] : null;
  const info: OxapayInfo = {
    trackId: String(d["track_id"] ?? id),
    status: String(d["status"] ?? "").toLowerCase(),
    amount: Number(d["amount"] ?? 0) || 0,
    currency: String(d["currency"] ?? "").toUpperCase(),
    orderId: String(d["order_id"] ?? ""),
    coin: String(tx?.["currency"] ?? ""),
    txHash: String(tx?.["tx_hash"] ?? ""),
  };
  return { ok: true as const, info };
}

/** HMAC-SHA512 of the raw body with the merchant key, sent in the `HMAC` header. */
export function oxapayVerifySignature(apiKey: string, rawBody: string, header: string | null) {
  if (!apiKey || !header) return false;
  const want = createHmac("sha512", apiKey).update(rawBody, "utf8").digest("hex");
  const got = header.trim().toLowerCase();
  if (got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

/** Connection test: a lookup of a non-existent invoice tells us if the key is accepted. */
export async function oxapayTest(apiKey: string) {
  if (!apiKey.trim()) return { ok: false, message: "Merchant API key is empty." };
  let res: Response;
  try {
    res = await fetch(`${BASE}/payment?size=1`, {
      headers: { merchant_api_key: apiKey.trim(), "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, message: "OxaPay is unreachable." };
  }
  const json: any = await res.json().catch(() => null);
  if (res.ok && Number(json?.status ?? 200) === 200) return { ok: true, message: "API Active — OxaPay accepted the merchant key." };
  return { ok: false, message: `Not connected: ${json?.error?.message || json?.message || `HTTP ${res.status}`}` };
}
