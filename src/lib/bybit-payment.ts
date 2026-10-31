import { z } from "zod";

export const bybitUidSchema = z.string().trim().regex(/^\d{1,20}$/, "Enter a valid Bybit UID");
export const bybitTxidSchema = z.string().trim().min(6).max(128).regex(/^[A-Za-z0-9_-]+$/, "Enter the internal transfer transaction ID");
export const BYBIT_SETTINGS = ["bybit_enabled", "bybit_uid", "bybit_api_verified", "bybit_icon"] as const;

export function bybitEnabled(settings: Record<string, string | undefined>): boolean {
  return ["1", "true", "on"].includes(settings["bybit_enabled"] ?? "") &&
    settings["bybit_api_verified"] === "1" && bybitUidSchema.safeParse(settings["bybit_uid"]).success;
}

export function bybitTransactionKey(txid: string): string {
  return `bybit:${bybitTxidSchema.parse(txid)}`;
}

export type BybitDeposit = { txID: string; coin: string; amount: string; status: number; type: number; createdTime: string };

/** Bybit returns internal deposit timestamps as seconds in its documented example. */
export function bybitDepositTime(value: string): number {
  if (!/^\d+$/.test(value)) return NaN;
  const number = Number(value);
  return number < 100_000_000_000 ? number * 1000 : number;
}

export function matchBybitDeposit(row: BybitDeposit, claim: { txid: string; amount: number; since: number; until: number }): boolean {
  const time = bybitDepositTime(row.createdTime);
  return row.txID === claim.txid && row.type === 1 && row.status === 2 && row.coin === "USDT" &&
    Number.isFinite(claim.amount) && claim.amount > 0 && Number(row.amount) === claim.amount &&
    Number.isFinite(time) && time >= claim.since && time <= claim.until;
}