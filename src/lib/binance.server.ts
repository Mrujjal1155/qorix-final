// Server-only Binance API helper (Pay ID + on-chain USDT deposits).
// Mirrors the paykori.online gateway logic: signed SAPI requests with HMAC-SHA256.
import { createHmac } from "crypto";

// api.binance.com is frequently blocked (HTTP 403 / 451) from datacenter IPs.
// Try every public mirror before giving up — this is what made auto-verify fail.
const HOSTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
  "https://api-gcp.binance.com",
];

export type BinanceCreds = { apiKey: string; secretKey: string };

/** Keys come from the admin dashboard (DB, server-only read) or fall back to env secrets. */
export async function getCreds(): Promise<BinanceCreds | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("binance_credentials")
      .select("api_key,api_secret")
      .eq("id", 1)
      .maybeSingle();
    if (data?.api_key && data?.api_secret) {
      return { apiKey: data.api_key as string, secretKey: data.api_secret as string };
    }
  } catch {
    /* fall through to env */
  }
  const apiKey = process.env["BINANCE_API_KEY"];
  const secretKey = process.env["BINANCE_API_SECRET"];
  if (!apiKey || !secretKey) return null;
  return { apiKey, secretKey };
}

/** True when keys are stored (without revealing them). */
export async function hasStoredCreds() {
  return (await getCreds()) !== null;
}

/** Validate a key pair without persisting it. */
export async function validateCreds(creds: BinanceCreds) {
  const r = await signedGet("/sapi/v1/capital/config/getall", {}, creds);
  if (!r.ok) return { ok: false as const, message: `Binance rejected the keys: ${r.error}` };
  return { ok: true as const, message: "Binance API keys are valid." };
}

/** Never leak provider HTML (CloudFront blocks etc.) into user-facing messages. */
function cleanError(msg: unknown, status: number) {
  const t = typeof msg === "string" ? msg.trim() : "";
  if (t && !t.startsWith("<")) return t.slice(0, 200);
  return `Binance API unreachable (HTTP ${status}).`;
}

async function signedGet(path: string, params: Record<string, string | number>, creds: BinanceCreds) {
  let last: { ok: false; status: number; error: string; data: any } | null = null;

  for (const host of HOSTS) {
    const query = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      timestamp: String(Date.now()),
      recvWindow: "10000",
    }).toString();
    const signature = createHmac("sha256", creds.secretKey).update(query).digest("hex");

    let res: Response;
    try {
      res = await fetch(`${host}${path}?${query}&signature=${signature}`, {
        headers: {
          "X-MBX-APIKEY": creds.apiKey,
          // Some edges reject requests without a browser-ish UA.
          "User-Agent": "Mozilla/5.0 (compatible; QorixBot/1.0)",
          Accept: "application/json",
        },
      });
    } catch {
      last = { ok: false, status: 0, error: "Binance API unreachable (network error).", data: null };
      continue;
    }

    const body = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(body);
    } catch {
      /* non-json */
    }

    if (res.ok) return { ok: true as const, status: res.status, data: json, error: null };

    console.error(`Binance ${host}${path} failed [${res.status}]: ${body.slice(0, 200)}`);
    last = { ok: false, status: res.status, error: cleanError(json?.msg, res.status), data: json };
    // Geo/edge blocks are host specific — retry on the next mirror.
    // Real API errors (bad key, bad params) repeat everywhere, so stop early.
    if (![403, 429, 451, 503, 0].includes(res.status)) break;
  }

  return last ?? { ok: false as const, status: 0, error: "Binance API unreachable.", data: null };
}

/** Fetch (or create) the merchant's USDT deposit address for a network. */
export async function getDepositAddress(network: string) {
  const creds = await getCreds();
  if (!creds) return { ok: false as const, error: "Binance API keys are not configured." };
  const r = await signedGet("/sapi/v1/capital/deposit/address", { coin: "USDT", network }, creds);
  if (!r.ok || !r.data?.address) {
    return { ok: false as const, error: r.ok ? "No address returned by Binance." : String(r.error) };
  }
  return { ok: true as const, address: r.data.address as string, tag: (r.data.tag ?? "") as string };
}

export type MatchResult =
  | { ok: true; txId: string; amount: number }
  | { ok: false; error?: string | undefined; pending: true };

/** Look for a matching on-chain USDT deposit of `expected` amount. */
export async function findCryptoDeposit(expected: number, network: string | null, isUsed: (tx: string) => Promise<boolean>): Promise<MatchResult> {
  const creds = await getCreds();
  if (!creds) return { ok: false, pending: true, error: "Binance API keys are not configured." };
  const r = await signedGet(
    "/sapi/v1/capital/deposit/hisrec",
    { coin: "USDT", limit: 50, startTime: (Date.now() - 2 * 60 * 60 * 1000) },
    creds,
  );
  if (!r.ok || !Array.isArray(r.data)) return { ok: false, pending: true, error: r.ok ? undefined : String(r.error) };
  for (const d of r.data) {
    const netMatch = !network || d.network === network;
    if (netMatch && Math.abs(Number(d.amount) - expected) < 0.01 && [0, 1, 6].includes(Number(d.status))) {
      const txId = String(d.txId ?? d.id);
      if (!(await isUsed(txId))) return { ok: true, txId, amount: Number(d.amount) };
    }
  }
  return { ok: false, pending: true };
}

/** Look for a matching Binance Pay (Pay ID) transfer of `expected` USDT. */
export async function findPayTransaction(expected: number, isUsed: (tx: string) => Promise<boolean>): Promise<MatchResult> {
  const creds = await getCreds();
  if (!creds) return { ok: false, pending: true, error: "Binance API keys are not configured." };
  const r = await signedGet("/sapi/v1/pay/transactions", { limit: 50, startTime: Date.now() - 2 * 60 * 60 * 1000 }, creds);
  if (!r.ok || !Array.isArray(r.data?.data)) return { ok: false, pending: true, error: r.ok ? undefined : String(r.error) };
  for (const t of r.data.data) {
    const amount = Number(t.amount);
    if (amount > 0 && Math.abs(amount - expected) < 0.01) {
      const txId = String(t.transactionId);
      if (!(await isUsed(txId))) return { ok: true, txId, amount };
    }
  }
  return { ok: false, pending: true };
}

export async function checkBinanceKeys() {
  const creds = await getCreds();
  if (!creds) return { ok: false as const, message: "API Key / Secret Key are not saved.", saved: false as const };
  const r = await validateCreds(creds);
  return { ...r, saved: true as const };
}

/** Match one specific transaction id against Binance Pay + on-chain deposit history. */
export async function findByTxId(txId: string): Promise<{ ok: true; amount: number } | { ok: false; error?: string }> {
  const creds = await getCreds();
  if (!creds) return { ok: false, error: "Binance API keys are not configured." };
  const needle = txId.trim().toLowerCase();
  const start = Date.now() - 24 * 60 * 60 * 1000;

  const pay = await signedGet("/sapi/v1/pay/transactions", { limit: 100, startTime: start }, creds);
  if (pay.ok && Array.isArray(pay.data?.data)) {
    for (const t of pay.data.data) {
      if (String(t.transactionId ?? "").toLowerCase() === needle) return { ok: true, amount: Number(t.amount) };
    }
  }

  const dep = await signedGet("/sapi/v1/capital/deposit/hisrec", { coin: "USDT", limit: 100, startTime: start }, creds);
  if (dep.ok && Array.isArray(dep.data)) {
    for (const d of dep.data) {
      if (String(d.txId ?? d.id ?? "").toLowerCase() === needle && [0, 1, 6].includes(Number(d.status))) {
        return { ok: true, amount: Number(d.amount) };
      }
    }
  }

  const err = !pay.ok && !dep.ok ? String(pay.error ?? dep.error) : undefined;
  return err ? { ok: false, error: err } : { ok: false };
}
