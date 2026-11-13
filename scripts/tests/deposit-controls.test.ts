import { expect, test } from "bun:test";
import { DEPOSIT_QR_KEYS, depositControls, depositPaidButton, depositQrControls, depositQrUrl, encodeDepositQr, readDepositQr } from "../../src/lib/bot/deposit-controls";

test("each gateway uses its own address-bound admin QR", () => {
  for (const [kind, network, key] of [
    ["payid", null, DEPOSIT_QR_KEYS.payid],
    ["bybit", null, DEPOSIT_QR_KEYS.bybit],
    ["chain_bep20", null, DEPOSIT_QR_KEYS.chain_bep20],
    ["chain_trc20", null, DEPOSIT_QR_KEYS.chain_trc20],
    ["crypto", "BSC", DEPOSIT_QR_KEYS.BSC],
    ["crypto", "TRX", DEPOSIT_QR_KEYS.TRX],
  ] as const) {
    const row = { id: "123", kind, network, address: "recipient" };
    const settings = { [key]: encodeDepositQr("https://example.com/qr.png", "recipient") };
    expect(depositQrUrl(row, settings)).toBe("https://example.com/qr.png");
    expect(depositQrUrl({ ...row, address: "changed" }, settings)).toBeNull();
    expect(depositQrUrl(row, {})).toBeNull();
  }
});

test("QR settings accept only HTTPS image references without URL credentials", () => {
  expect(readDepositQr(encodeDepositQr("http://example.com/qr.png", "id"))).toBeNull();
  expect(readDepositQr(encodeDepositQr("https://user:pass@example.com/qr.png", "id"))).toBeNull();
  expect(readDepositQr("broken")).toBeNull();
});

test("copy action carries the exact receiving address, never a callback or URL", () => {
  const address = "0x1111111111111111111111111111111111111111";
  const copy = depositControls({ id: "00000000-0000-0000-0000-000000000123", kind: "chain_bep20", address })[0][0];
  expect(copy.copy_text).toEqual({ text: address });
  expect(copy.callback_data).toBeUndefined();
  expect(copy.url).toBeUndefined();
});

test("copy payload never exceeds Telegram's 256-character maximum", () => {
  expect(depositControls({ id: "123", kind: "payid", address: "a".repeat(256) })[0][0].copy_text?.text.length).toBe(256);
  expect(depositControls({ id: "123", kind: "payid", address: "a".repeat(257) }).flat().some(button => button.copy_text)).toBe(false);
});

test("QR and main view route submission to the same deposit without mutation", () => {
  for (const kind of ["payid", "bybit", "chain_bep20", "chain_trc20", "crypto"]) {
    const row = Object.freeze({ id: "00000000-0000-0000-0000-000000000123", kind, address: "recipient" });
    const qr = depositQrControls(row);
    expect(qr[1][0].callback_data).toBe(depositPaidButton(row).callback_data);
    expect(qr[0][0].copy_text).toEqual({ text: "recipient" });
    expect(qr[2][0].callback_data).toBe(`bview:${row.id}`);
    expect(qr[2][1].callback_data).toBe("depchange");
    for (const button of qr.flat()) {
      expect(Number(Boolean(button.copy_text)) + Number(Boolean(button.callback_data))).toBe(1);
      if (button.callback_data) expect(new TextEncoder().encode(button.callback_data).length).toBeLessThanOrEqual(64);
    }
  }
});