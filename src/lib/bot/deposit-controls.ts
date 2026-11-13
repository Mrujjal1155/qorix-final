import type { Button } from "@/lib/telegram.server";

export const DEPOSIT_QR_KEYS = {
  payid: "deposit_qr_binance",
  bybit: "deposit_qr_bybit",
  chain_bep20: "deposit_qr_chain_bep20",
  chain_trc20: "deposit_qr_chain_trc20",
  BSC: "deposit_qr_binance_bep20",
  TRX: "deposit_qr_binance_trc20",
} as const;

export type DepositPresentation = { id: string; kind: string; network?: string | null; address: string };

export function depositQrKey(row: Pick<DepositPresentation, "kind" | "network">): string | undefined {
  if (row.kind === "crypto") return row.network === "BSC" ? DEPOSIT_QR_KEYS.BSC : row.network === "TRX" ? DEPOSIT_QR_KEYS.TRX : undefined;
  return DEPOSIT_QR_KEYS[row.kind as keyof typeof DEPOSIT_QR_KEYS];
}

export function encodeDepositQr(url: string, address: string): string {
  return url.trim() ? JSON.stringify({ url: url.trim(), address: address.trim() }) : "";
}

export function readDepositQr(value: string | undefined): { url: string; address: string } | null {
  try {
    const parsed = JSON.parse(value ?? "");
    if (typeof parsed?.url !== "string" || typeof parsed?.address !== "string") return null;
    const url = new URL(parsed.url);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return { url: parsed.url, address: parsed.address };
  } catch { return null; }
}

export function depositQrUrl(row: DepositPresentation, settings: Record<string, string>): string | null {
  const key = depositQrKey(row);
  const qr = readDepositQr(key ? settings[key] : undefined);
  return qr && qr.address === row.address.trim() ? qr.url : null;
}

export function depositControls(row: DepositPresentation): Button[][] {
  const copy: Button[] = [];
  if (row.address.length >= 1 && row.address.length <= 256) copy.push({ text: row.kind === "payid" || row.kind === "bybit" ? "📋 Copy ID" : "📋 Copy Address", copy_text: { text: row.address } });
  copy.push({ text: "▦ Show QR", callback_data: `bqr:${row.id}` });
  return [copy];
}

export const changeGatewayButton: Button = { text: "🔄 Change Gateway", callback_data: "depchange" };