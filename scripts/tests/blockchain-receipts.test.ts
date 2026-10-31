import { afterEach, expect, test } from "bun:test";
import { CHAIN_TOKEN, TRANSFER_TOPIC } from "../../src/lib/blockchain-payment";
import { readChainTransfers, tronRead } from "../../src/lib/blockchain.server";
const originalFetch = globalThis.fetch;
const txid = `0x${"a".repeat(64)}`;
let status = "0x1", finalized = "0x100", canonical = true;
function setup() {
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    const { method } = JSON.parse(String(init.body));
    const result = method === "eth_getTransactionReceipt" ? { transactionHash: txid, status, blockHash: "0xabc", blockNumber: "0x100", logs: [{ address: CHAIN_TOKEN.bep20, topics: [TRANSFER_TOPIC, `0x${"0".repeat(24)}${"2".repeat(40)}`, `0x${"0".repeat(24)}${"1".repeat(40)}`], data: `0x${10250000000000000000n.toString(16).padStart(64, "0")}` }] } : { number: finalized, hash: canonical ? "0xabc" : "0xdef", timestamp: "0x2" };
    return Response.json({ result });
  }) as typeof fetch;
}
afterEach(() => { globalThis.fetch = originalFetch; status = "0x1"; finalized = "0x100"; canonical = true; });
test("successful canonical finalized receipt decodes exact token transfer", async () => { setup(); const rows = await readChainTransfers("bep20", txid); expect(rows.length).toBe(1); expect(rows[0]?.units).toBe(10250000000000000000n); expect(rows[0]?.receiver).toBe("1".repeat(40)); });
test("failed execution produces no payable transfer", async () => { status = "0x0"; setup(); expect(await readChainTransfers("bep20", txid)).toEqual([]); });
test("receipt beyond finalized block is not payable", async () => { finalized = "0xff"; setup(); expect(await readChainTransfers("bep20", txid)).toEqual([]); });
test("noncanonical receipt is not payable", async () => { canonical = false; setup(); expect(await readChainTransfers("bep20", txid)).toEqual([]); });
test("API outage rejects instead of confirming", async () => { globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch; expect(readChainTransfers("bep20", txid)).rejects.toThrow(); });
test("solidified TRON receipt requires successful contract execution", async () => {
  const previousKey = process.env["TRONGRID_API_KEY"];
  process.env["TRONGRID_API_KEY"] = "test-only";
  try {
    let success = true;
    globalThis.fetch = (async () => Response.json({ id: "a".repeat(64), blockTimeStamp: 2000, receipt: { result: success ? "SUCCESS" : "REVERT" }, log: [{ address: CHAIN_TOKEN.trc20, topics: [TRANSFER_TOPIC.slice(2), "0".repeat(24) + "2".repeat(40), "0".repeat(24) + "1".repeat(40)], data: 10250000n.toString(16).padStart(64, "0") }] })) as typeof fetch;
    expect((await readChainTransfers("trc20", "a".repeat(64)))[0]?.units).toBe(10250000n);
    success = false; expect(await readChainTransfers("trc20", "a".repeat(64))).toEqual([]);
  } finally {
    if (previousKey === undefined) delete process.env["TRONGRID_API_KEY"]; else process.env["TRONGRID_API_KEY"] = previousKey;
  }
});
test("TRON uses its direct provider secret without Lovable gateway headers", async () => {
  const previousKey = process.env["TRONGRID_API_KEY"];
  process.env["TRONGRID_API_KEY"] = "test-only";
  try {
    let called = false;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      called = true;
      expect(String(url)).toBe("https://api.trongrid.io/walletsolidity/getnowblock");
      const headers = new Headers(init?.headers);
      expect(headers.has("TRON-PRO-API-KEY")).toBe(true);
      expect(headers.has("Authorization")).toBe(false);
      expect(headers.has("X-Connection-Api-Key")).toBe(false);
      expect(init?.redirect).toBe("error");
      return Response.json({ blockID: "solidified-block" });
    }) as typeof fetch;
    expect((await tronRead("/walletsolidity/getnowblock")).blockID).toBe("solidified-block");
    expect(called).toBe(true);
  } finally {
    if (previousKey === undefined) delete process.env["TRONGRID_API_KEY"]; else process.env["TRONGRID_API_KEY"] = previousKey;
  }
});
test("missing direct TRON secret fails closed before any provider request", async () => {
  const previousKey = process.env["TRONGRID_API_KEY"];
  delete process.env["TRONGRID_API_KEY"];
  try {
    let called = false;
    globalThis.fetch = (async () => { called = true; return Response.json({ blockID: "unused" }); }) as typeof fetch;
    await expect(tronRead("/walletsolidity/getnowblock")).rejects.toThrow("TRONGRID_API_KEY");
    expect(called).toBe(false);
  } finally {
    if (previousKey !== undefined) process.env["TRONGRID_API_KEY"] = previousKey;
  }
});