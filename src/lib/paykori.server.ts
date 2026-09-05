// Server-only Pay Kori gateway helper (bKash / Nagad / Rocket).
// Docs: https://paykori.online/developers  — base https://checkout.paykori.online/api/
//
// SECURITY MODEL
// - The API key never leaves the server (settings row or PAYKORI_API_KEY secret).
// - A webhook / success redirect is NEVER trusted on its own. Every credit goes
//   through `verifyPayment()` (server -> gateway) and the amount is compared with
//   the amount we asked for. A user cannot fake a completed payment by calling
//   our webhook URL, because the gateway itself is the source of truth.

const DEFAULT_BASE = "https://checkout.paykori.online/api";

export type PaykoriConfig = {
  enabled: boolean;
  apiKey: string;
  base: string;
  /** BDT per 1 USD */
  rate: number;
  methods: string[];
};

export const PAYKORI_METHODS: Record<string, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
};

export function paykoriConfig(settings: Record<string, string>): PaykoriConfig {
  const apiKey = (settings["paykori_key"] || process.env["PAYKORI_API_KEY"] || "").trim();
  const base = (settings["paykori_base"] || DEFAULT_BASE).trim().replace(/\/+$/, "");
  const rate = Number(settings["bdt_rate"] || 129) || 129;
  const raw = (settings["paykori_methods"] || "bkash,nagad,rocket")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter((m) => !!PAYKORI_METHODS[m]);
  return {
    enabled: !!apiKey && settings["paykori_enabled"] !== "0",
    apiKey,
    base,
    rate,
    methods: raw.length ? raw : Object.keys(PAYKORI_METHODS),
  };
}

export function usdToBdt(usd: number, rate: number) {
  return Math.round(usd * rate * 100) / 100;
}

export function bdtToUsd(bdt: number, rate: number) {
  return Math.round((bdt / rate) * 100) / 100;
}

async function call(cfg: PaykoriConfig, path: string, body: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/${path}`, {
      method: "POST",
      headers: {
        "API-KEY": cfg.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false as const, error: "Pay Kori gateway is unreachable. Please try again." , data: null };
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg = typeof json?.message === "string" ? json.message : `Pay Kori error (HTTP ${res.status}).`;
    console.error(`Pay Kori ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
    return { ok: false as const, error: msg.slice(0, 200), data: json };
  }
  return { ok: true as const, error: null, data: json };
}

function pick(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/** Create a hosted checkout link. Amount must be in BDT. */
export async function createPayment(
  cfg: PaykoriConfig,
  input: {
    amountBdt: number;
    successUrl: string;
    cancelUrl: string;
    orderId: string;
    email?: string | undefined;
    phone?: string | undefined;
  },
) {
  const r = await call(cfg, "payment/create", {
    amount: input.amountBdt.toFixed(2),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    order_id: input.orderId,
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
  });
  if (!r.ok) return { ok: false as const, error: r.error };

  const d = r.data ?? {};
  const nested = d.data ?? d.payment ?? d.result ?? {};
  const url =
    pick(d, ["payment_url", "paymentUrl", "url", "checkout_url", "redirect_url", "link"]) ??
    pick(nested, ["payment_url", "paymentUrl", "url", "checkout_url", "redirect_url", "link"]);
  const transactionId =
    pick(d, ["transaction_id", "transactionId", "trxId", "trx_id", "id"]) ??
    pick(nested, ["transaction_id", "transactionId", "trxId", "trx_id", "id"]);

  if (!url) return { ok: false as const, error: "Pay Kori did not return a payment link." };
  return { ok: true as const, url, transactionId };
}

export type PaykoriVerify = {
  status: string;
  amount: number;
  fee: number;
  method: string;
  orderId: string | null;
  transactionId: string | null;
};

/** Server-side truth: ask the gateway what really happened with a transaction. */
export async function verifyPayment(cfg: PaykoriConfig, transactionId: string) {
  const r = await call(cfg, "payment/verify", { transaction_id: transactionId });
  if (!r.ok) return { ok: false as const, error: r.error };
  const d = r.data ?? {};
  const n = d.data ?? d.payment ?? d.transaction ?? d.result ?? {};
  const src = { ...n, ...d };
  const status = (pick(src, ["status", "payment_status", "paymentStatus"]) ?? "").toLowerCase();
  const amount = Number(pick(src, ["paymentAmount", "payment_amount", "amount"]) ?? 0) || 0;
  const fee = Number(pick(src, ["paymentFee", "payment_fee", "fee"]) ?? 0) || 0;
  const method = pick(src, ["paymentMethod", "payment_method", "method"]) ?? "";
  const orderId = pick(src, ["order_id", "orderId"]);
  const tx = pick(src, ["transactionId", "transaction_id", "trxId"]) ?? transactionId;
  const info: PaykoriVerify = { status, amount, fee, method, orderId, transactionId: tx };
  return { ok: true as const, info };
}

export function isPaid(status: string) {
  return ["completed", "complete", "success", "successful", "paid", "approved"].includes(
    (status || "").toLowerCase(),
  );
}
