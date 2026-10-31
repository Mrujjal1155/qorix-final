import { createHmac } from "node:crypto";
import { BYBIT_SETTINGS, bybitEnabled, bybitTxidSchema, matchBybitDeposit, type BybitDeposit } from "@/lib/bybit-payment";

export async function bybitSettings(): Promise<Record<string, string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("bot_settings").select("key,value").in("key", [...BYBIT_SETTINGS]);
  if (error) throw new Error("Bybit settings unavailable.");
  const settings = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? ""]));
  // Recheck the receiving account before offering payment after a secret rotation.
  if (bybitEnabled(settings)) {
    const apiKey = process.env["BYBIT_API_KEY"];
    const secret = process.env["BYBIT_API_SECRET"];
    try {
      if (!apiKey || !secret) throw new Error("Credentials unavailable");
      const account = await bybitGet("/v5/user/query-api", {}, { apiKey, secret });
      if (String(account.userID ?? "") !== settings["bybit_uid"] || account.readOnly !== 1) throw new Error("Account changed");
    } catch { settings["bybit_enabled"] = "0"; }
  }
  return settings;
}

/** Secrets are supplied by the calling server boundary, never returned to clients. */
export async function bybitGet(path: string, params: Record<string, string>, credentials: { apiKey: string; secret: string }) {
  const query = new URLSearchParams(params).toString();
  const timestamp = String(Date.now());
  const recvWindow = "5000";
  const signature = createHmac("sha256", credentials.secret).update(timestamp + credentials.apiKey + recvWindow + query).digest("hex");
  const response = await fetch(`https://api.bybit.com${path}?${query}`, {
    headers: { "X-BAPI-API-KEY": credentials.apiKey, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-RECV-WINDOW": recvWindow, "X-BAPI-SIGN": signature },
    signal: AbortSignal.timeout(8000),
  });
  // Never log the signed request, headers, or arbitrary provider response fields.
  if (!response.ok) throw new Error(`Bybit API unavailable (HTTP ${response.status}).`);
  const body = await response.json() as { retCode: number; result?: { rows?: BybitDeposit[]; nextPageCursor?: string; userID?: string; readOnly?: number } };
  if (body.retCode !== 0) throw new Error(`Bybit rejected the request (code ${body.retCode}).`);
  if (!body.result) throw new Error("Bybit returned an incomplete response.");
  return body.result;
}

export async function checkBybitCredentials(credentials: { apiKey: string; secret: string }, uid: string) {
  const account = await bybitGet("/v5/user/query-api", {}, credentials);
  if (String(account.userID ?? "") !== uid) throw new Error("Bybit UID does not match the API account.");
  if (account.readOnly !== 1) throw new Error("Use a Read-only Bybit API key.");
  await bybitGet("/v5/asset/deposit/query-internal-record", { coin: "USDT", limit: "1" }, credentials);
  return { ok: true, message: "Bybit UID and internal deposit access verified." };
}

export async function findBybitPayment(claim: { txid: string; amount: number; since: number; until: number }) {
  const apiKey = process.env["BYBIT_API_KEY"];
  const secret = process.env["BYBIT_API_SECRET"];
  if (!apiKey || !secret) return { ok: false as const, reason: "Bybit credentials are not configured." };
  if (!bybitTxidSchema.safeParse(claim.txid).success) return { ok: false as const, reason: "Invalid internal transfer ID." };
  try {
    const settings = await bybitSettings();
    if (!bybitEnabled(settings)) return { ok: false as const, reason: "Bybit Pay is disabled." };
    const account = await bybitGet("/v5/user/query-api", {}, { apiKey, secret });
    if (String(account.userID ?? "") !== settings["bybit_uid"] || account.readOnly !== 1) return { ok: false as const, reason: "Bybit account verification failed." };
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const result = await bybitGet("/v5/asset/deposit/query-internal-record", {
        txID: claim.txid, coin: "USDT", startTime: String(Math.floor(claim.since)), endTime: String(Math.floor(claim.until)), limit: "50", ...(cursor ? { cursor } : {}),
      }, { apiKey, secret });
      if (!Array.isArray(result.rows)) throw new Error("Bybit returned an incomplete deposit history.");
      const matched = result.rows.find((row) => matchBybitDeposit(row, claim));
      if (matched) return { ok: true as const, txid: matched.txID, amount: Number(matched.amount) };
      if (!result.nextPageCursor || result.nextPageCursor === cursor) break;
      cursor = result.nextPageCursor;
    }
    return { ok: false as const, reason: "No matching successful USDT internal deposit yet. We will check again automatically." };
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : "Bybit verification will retry." };
  }
}