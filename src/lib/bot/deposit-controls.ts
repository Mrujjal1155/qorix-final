import type { Button } from "@/lib/telegram.server";
import { uiBtn, type UiKey } from "@/lib/bot/ui.server";

export const DEPOSIT_CONTROL_ICON_KEYS = [
  "dep_copy_address", "dep_copy_id", "dep_show_qr", "dep_change_gateway",
  "dep_cancel", "dep_qr_back", "dep_paid_payid", "dep_paid_bybit", "dep_paid_txid",
] as const;

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

export function depositControls(row: DepositPresentation, settings: Record<string, string> = {}): Button[][] {
  const copy: Button[] = [];
  if (row.address.length >= 1 && row.address.length <= 256) {
    const { callback_data: _callback, ...appearance } = depositNavigationButton(settings, row.kind === "payid" || row.kind === "bybit" ? "dep_copy_id" : "dep_copy_address", "");
    copy.push({ ...appearance, copy_text: { text: row.address } });
  }
  copy.push(depositNavigationButton(settings, "dep_show_qr", `bqr:${row.id}`));
  return [copy];
}

export function depositNavigationButton(settings: Record<string, string>, key: UiKey, callback: string): Button {
  return { ...uiBtn(settings, key, callback), style: "primary" };
}

export function changeGatewayButton(settings: Record<string, string> = {}): Button {
  return depositNavigationButton(settings, "dep_change_gateway", "depchange");
}

export function depositPaidButton(row: DepositPresentation, settings: Record<string, string> = {}): Button {
  const key = row.kind === "payid" ? "dep_paid_payid" : row.kind === "bybit" ? "dep_paid_bybit" : "dep_paid_txid";
  return { ...uiBtn(settings, key, `bchk:${row.id}`), style: "success" };
}

export function depositQrControls(row: DepositPresentation, settings: Record<string, string> = {}): Button[][] {
  const copy = depositControls(row, settings).flat().filter(button => button.copy_text);
  return [
    ...(copy.length ? [copy] : []),
    [depositPaidButton(row, settings)],
    [depositNavigationButton(settings, "dep_qr_back", `bview:${row.id}`), changeGatewayButton(settings)],
  ];
}