// Server-only EPS (Easy Payment System) gateway helper.
// Docs: EPS Merchant API Integration Guide v0.5 — https://pgapi.eps.com.bd
//
// EPS is a hosted checkout: the buyer picks bKash / Nagad / Rocket / Visa /
// Mastercard / bank on the EPS page. We only create the payment and then ask
// EPS what really happened.
//
// SECURITY MODEL
// - Credentials never leave the server (bot_settings row or env fallback).
// - A success redirect is only a hint. Nothing is marked paid until
//   `verifyTransaction()` (server -> EPS) reports Success with an amount that
//   covers what we asked for.

import { createDecipheriv, createHmac } from "crypto";

const DEFAULT_BASE = "https://pgapi.eps.com.bd";

export type EpsConfig = {
  enabled: boolean;
  base: string;
  userName: string;
  password: string;
  hashKey: string;
  merchantId: string;
  storeId: string;
  /** BDT per 1 USD (shared with the other BDT gateway). */
  rate: number;
};

/** Payment options the EPS hosted page offers — shown on our checkout page. */
export const EPS_CHANNELS = ["bKash", "Nagad", "Rocket", "Visa", "Mastercard", "Internet Banking"];

export function epsConfig(settings: Record<string, string>): EpsConfig {
  const g = (key: string, env: string) => (settings[key] || process.env[env] || "").trim();
  const userName = g("eps_username", "EPS_USERNAME");
  const password = g("eps_password", "EPS_PASSWORD");
  const hashKey = g("eps_hash_key", "EPS_HASH_KEY");
  const merchantId = g("eps_merchant_id", "EPS_MERCHANT_ID");
  const storeId = g("eps_store_id", "EPS_STORE_ID");
  const base = (settings["eps_base"] || process.env["EPS_BASE"] || DEFAULT_BASE).trim().replace(/\/+$/, "");
  const rate = Number(settings["bdt_rate"] || 129) || 129;
  return {
    enabled:
      settings["eps_enabled"] !== "0" && !!userName && !!password && !!hashKey && !!merchantId && !!storeId,
    base,
    userName,
    password,
    hashKey,
    merchantId,
    storeId,
    rate,
  };
}

/** x-hash: base64( HMAC-SHA512( utf8(hashKey), message ) ). */
export function epsHash(hashKey: string, message: string) {
  return createHmac("sha512", Buffer.from(hashKey, "utf8")).update(message, "utf8").digest("base64");
}

/** Secret key used by EPS to AES-encrypt IPN payloads. */
export function epsSecretKey(settings: Record<string, string>) {
  return (
    settings["eps_secret_key"] ||
    process.env["EPS_SECRET_KEY"] ||
    settings["eps_hash_key"] ||
    process.env["EPS_HASH_KEY"] ||
    ""
  ).trim();
}

export type EpsIpnPayload = {
  EpsTransactionId?: string;
  MerchantTransactionId?: string;
  StoreId?: number;
  Status?: string;
  TotalAmount?: number;
  StoreAmount?: number;
  TransactionDate?: string;
  TransactionType?: string;
  FinancialEntity?: string;
  CustomerId?: string;
  CustomerName?: string;
  CustomerPhone?: string;
  CustomerEmail?: string;
  CustomerAddress?: string;
  Timestamp?: number;
};

/**
 * Decrypt an IPN `Data` field: AES-256-CBC, PKCS7, format `base64IV:base64Cipher`.
 * The key is the merchant Secret Key, padded/truncated to 32 bytes.
 */
export function decryptIpn(data: string, secretKey: string): EpsIpnPayload | null {
  try {
    const idx = data.indexOf(":");
    if (idx <= 0 || !secretKey) return null;
    const iv = Buffer.from(data.slice(0, idx), "base64");
    const cipher = Buffer.from(data.slice(idx + 1), "base64");
    const key = Buffer.alloc(32);
    Buffer.from(secretKey, "utf8").copy(key, 0, 0, Math.min(32, Buffer.byteLength(secretKey, "utf8")));
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    decipher.setAutoPadding(true);
    const out = Buffer.concat([decipher.update(cipher), decipher.final()]).toString("utf8");
    return JSON.parse(out) as EpsIpnPayload;
  } catch {
    return null;
  }
}

export function usdToBdt(usd: number, rate: number) {
  return Math.round(usd * rate * 100) / 100;
}

export function bdtToUsd(bdt: number, rate: number) {
  return Math.round((bdt / rate) * 100) / 100;
}

/** Unique, EPS-safe merchant transaction id (min 10 digits). */
export function newMerchantTransactionId() {
  const now = new Date();
  const stamp =
    `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}` +
    `${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  return `${stamp}${Math.floor(Math.random() * 9000 + 1000)}`;
}

type Json = Record<string, any>;

async function request(
  cfg: EpsConfig,
  path: string,
  init: { method: "GET" | "POST"; hashMessage: string; token?: string; body?: Json },
) {
  const headers: Record<string, string> = {
    "x-hash": epsHash(cfg.hashKey, init.hashMessage),
    Accept: "application/json",
  };
  if (init.token) headers["Authorization"] = `Bearer ${init.token}`;
  if (init.body) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${cfg.base}${path}`, {
      method: init.method,
      headers,
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    return { ok: false as const, error: "EPS gateway is unreachable. Please try again.", data: null as Json | null };
  }
  const text = await res.text();
  let json: Json | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg =
      (typeof json?.["errorMessage"] === "string" && json["errorMessage"]) ||
      (typeof json?.["ErrorMessage"] === "string" && json["ErrorMessage"]) ||
      `EPS error (HTTP ${res.status}).`;
    console.error(`EPS ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
    return { ok: false as const, error: String(msg).slice(0, 200), data: json };
  }
  return { ok: true as const, error: null, data: json };
}

function pick(obj: Json | null, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/** API 01 — auth token (hashed with the user name). */
export async function getToken(cfg: EpsConfig) {
  const r = await request(cfg, "/v1/Auth/GetToken", {
    method: "POST",
    hashMessage: cfg.userName,
    body: { userName: cfg.userName, password: cfg.password },
  });
  if (!r.ok) return { ok: false as const, error: r.error };
  const token = pick(r.data, ["token", "Token"]);
  if (!token) {
    const err = pick(r.data, ["errorMessage", "ErrorMessage"]) ?? "EPS did not return an auth token.";
    return { ok: false as const, error: err };
  }
  return { ok: true as const, token };
}

export type EpsInitInput = {
  merchantTransactionId: string;
  customerOrderId: string;
  amountBdt: number;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
  customerPostcode?: string;
  customerCountry?: string;
  productName: string;
  noOfItem?: number;
  productCategory?: string;
};

/** API 02 — create the hosted payment and get the redirect URL. */
export async function initializePayment(cfg: EpsConfig, input: EpsInitInput) {
  const auth = await getToken(cfg);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const body: Json = {
    merchantId: cfg.merchantId,
    storeId: cfg.storeId,
    CustomerOrderId: input.customerOrderId,
    merchantTransactonId: input.merchantTransactionId,
    TransactionTypeId: 1,
    totalAmount: Number(input.amountBdt.toFixed(2)),
    successUrl: input.successUrl,
    failUrl: input.failUrl,
    cancelUrl: input.cancelUrl,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerAddress: input.customerAddress || "Dhaka",
    customerCity: input.customerCity || "Dhaka",
    customerState: input.customerState || "Dhaka",
    customerPostcode: input.customerPostcode || "1000",
    customerCountry: input.customerCountry || "Bangladesh",
    customerPhone: input.customerPhone,
    ShippingMethod: "NO",
    NoOfItem: String(input.noOfItem ?? 1),
    ProductName: input.productName,
    ProductProfile: "digital-goods",
    ProductCategory: input.productCategory || "Digital",
  };

  const r = await request(cfg, "/v1/EPSEngine/InitializeEPS", {
    method: "POST",
    hashMessage: input.merchantTransactionId,
    token: auth.token,
    body,
  });
  if (!r.ok) return { ok: false as const, error: r.error };

  const url = pick(r.data, ["RedirectURL", "redirectURL", "redirectUrl"]);
  const transactionId = pick(r.data, ["TransactionId", "transactionId"]);
  if (!url) {
    const err = pick(r.data, ["ErrorMessage", "errorMessage"]) ?? "EPS did not return a payment link.";
    return { ok: false as const, error: err };
  }
  return { ok: true as const, url, transactionId };
}

export type EpsVerify = {
  status: string;
  amount: number;
  merchantTransactionId: string;
  epsTransactionId: string | null;
  financialEntity: string;
  errorMessage: string;
};

/** API 03 — server-side truth about a transaction. */
export async function verifyTransaction(
  cfg: EpsConfig,
  ids: { merchantTransactionId?: string | null; epsTransactionId?: string | null },
) {
  const mtid = (ids.merchantTransactionId ?? "").trim();
  const etid = (ids.epsTransactionId ?? "").trim();
  if (!mtid && !etid) return { ok: false as const, error: "Missing transaction id." };

  const auth = await getToken(cfg);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const qs = new URLSearchParams();
  if (mtid) qs.set("merchantTransactionId", mtid);
  if (etid) qs.set("EPSTransactionId", etid);

  const r = await request(cfg, `/v1/EPSEngine/CheckMerchantTransactionStatus?${qs.toString()}`, {
    method: "GET",
    // The hash uses whichever id we look the transaction up by.
    hashMessage: mtid || etid,
    token: auth.token,
  });
  if (!r.ok) return { ok: false as const, error: r.error };

  const d = r.data ?? {};
  const info: EpsVerify = {
    status: (pick(d, ["Status", "status"]) ?? "").toLowerCase(),
    amount: Number(pick(d, ["TotalAmount", "totalAmount"]) ?? 0) || 0,
    merchantTransactionId: pick(d, ["MerchantTransactionId", "merchantTransactionId"]) ?? mtid,
    epsTransactionId: pick(d, ["EpsTransactionId", "EPSTransactionId", "epsTransactionId"]) ?? (etid || null),
    financialEntity: pick(d, ["FinancialEntity", "financialEntity"]) ?? "",
    errorMessage: pick(d, ["ErrorMessage", "errorMessage"]) ?? "",
  };
  return { ok: true as const, info };
}

export function isPaid(status: string) {
  return ["success", "successful", "completed", "complete", "paid", "approved"].includes(
    (status || "").toLowerCase(),
  );
}
