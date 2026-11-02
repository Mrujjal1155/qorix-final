import { expect, test } from "bun:test";
import { buildWalletHistory, historyMethod, historyOwner, historyPage, historyStatus } from "../../src/lib/bot/wallet-history";
import { readWalletHistory } from "../../src/lib/bot/wallet-history.server";

test("pending deposits are not completed", () => { expect(historyStatus("pending")).toBe("⏳ Pending"); });
test("failed deposits are not completed", () => { expect(historyStatus("failed")).toBe("❌ Failed"); });
test("credited deposits are completed", () => { expect(historyStatus("credited")).toBe("✅ Completed"); });
test("rejected manual requests stay rejected", () => { expect(historyStatus("rejected")).toBe("⛔ Rejected"); });
test("expiry is never guessed from age", () => { expect(historyStatus("expired")).toBe("⌛ Expired"); expect(historyStatus("unrecognized")).toBe("❔ Unknown"); });
test("gateway methods distinguish Binance, Bybit and both chains", () => {
  expect(historyMethod("payid")).toBe("Binance Pay"); expect(historyMethod("bybit")).toBe("Bybit Pay");
  expect(historyMethod("chain_trc20")).toBe("USDT · TRC20"); expect(historyMethod("chain_bep20")).toBe("USDT · BEP20");
  expect(historyMethod("eps", "card")).toBe("EPS · Card"); expect(historyMethod("eps", "mfs")).toBe("EPS · Mobile banking");
});
test("only the same sender's private chat can read history", () => {
  expect(historyOwner({ id: 123, type: "private" }, 123)).toBe(123);
  expect(historyOwner({ id: 124, type: "private" }, 123)).toBeNull();
  expect(historyOwner({ id: -123, type: "supergroup" }, 123)).toBeNull();
});
test("invalid pagination cannot generate database offsets", () => {
  for (const page of ["-1", "NaN", "Infinity", "1.5", "999999999", ""]) expect(historyPage(page)).toBeNull();
  expect(historyPage("0")).toBe(0); expect(historyPage("2")).toBe(2);
});

function database(records: Record<string, any[]>, failed?: string) {
  const reads: Array<{ table: string; selection: string; owner?: number }> = [];
  return { reads, from(table: string) {
    const read = { table, selection: "", owner: undefined as number | undefined }; reads.push(read);
    let start = 0, end = Infinity;
    const chain: any = {
      select(value: string) { read.selection = value; return chain; },
      eq(key: string, value: number) { if (key === "telegram_id") read.owner = value; return chain; },
      order() { return chain; }, range(a: number, b: number) { start = a; end = b + 1; return chain; },
      limit(n: number) { end = n; return chain; },
      then(resolve: any) { return Promise.resolve({ data: (records[table] ?? []).filter((r) => r.telegram_id === read.owner).slice(start, end), error: failed === table ? { message: "private failure" } : null }).then(resolve); },
    }; return chain;
  } };
}
const ledger = (i: number) => ({ id: String(i), telegram_id: 123, amount: -i, type: "purchase", method: "wallet", status: "completed", created_at: `2026-11-02T09:${String(30 - i).padStart(2, "0")}:00Z` });

test("exact last ledger page has no next page and other users are excluded", async () => {
  const db = database({ transactions: [...Array.from({ length: 5 }, (_, i) => ledger(i)), { ...ledger(99), telegram_id: 999 }] });
  const result = await readWalletHistory(db, 123, "transactions", 0);
  expect(result.rows).toHaveLength(5); expect(result.hasNext).toBe(false);
  expect(db.reads[0]?.owner).toBe(123); expect(db.reads[0]?.selection).not.toContain("*");
});
test("ledger next page uses lookahead, not an exact-full-page guess", async () => {
  const db = database({ transactions: Array.from({ length: 6 }, (_, i) => ledger(i)) });
  expect((await readWalletHistory(db, 123, "transactions", 0)).hasNext).toBe(true);
  const next = await readWalletHistory(db, 123, "transactions", 1);
  expect(next.rows.map((r) => r.id)).toEqual(["5"]); expect(next.hasNext).toBe(false);
});
test("manual and automatic attempts merge chronologically and checkout is not a deposit", async () => {
  const db = database({
    binance_deposits: [{ ...ledger(1), amount_usdt: 10, kind: "bybit", status: "pending", checkout_item: { product_id: "private-product" } }],
    payment_requests: [{ ...ledger(0), amount: 12, method: "bKash", status: "rejected", admin_note: "private note" }, { ...ledger(2), telegram_id: 999 }],
  });
  const result = await readWalletHistory(db, 123, "payments", 0);
  expect(result.rows.map((r) => r.id)).toEqual(["0", "1"]);
  expect(result.rows[1]?.checkout).toBe(true); expect(result.rows[1]?.status).toBe("pending");
  expect(JSON.stringify(result.rows)).not.toContain("private-product"); expect(JSON.stringify(result.rows)).not.toContain("private note");
  expect(db.reads.every((r) => r.owner === 123)).toBe(true);
});
test("payment history query errors are not an empty-history success", async () => {
  const result = await readWalletHistory(database({}, "payment_requests"), 123, "payments", 0);
  expect(result.error).toBe(true); expect(result.rows).toEqual([]);
});
test("table message remains bounded and does not modify accounting rows", () => {
  const entries = Array.from({ length: 5 }, (_, i) => ({ ...ledger(i), kind: "crypto", network: "<unsafe&>" }));
  const before = JSON.stringify(entries);
  const html = buildWalletHistory(entries, "payments", "Payments");
  expect(html.length).toBeLessThan(4096); expect(html).not.toContain("<UNSAFE&>");
  expect(JSON.stringify(entries)).toBe(before);
});