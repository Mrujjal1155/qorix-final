import bs58 from "bs58";
import { sha256, toHex } from "viem";
import { CHAIN_TOKEN, TRANSFER_TOPIC, chainTxid, matchesChainPayment, type Chain, type ChainTransfer } from "@/lib/blockchain-payment";

export const BSC_RPC = "https://bsc-dataseed.bnbchain.org";
const TRON_GATEWAY = "https://connector-gateway.lovable.dev/udc_trongrid";
export async function bscRpc(method: string, params: unknown[]) {
  const response = await fetch(BSC_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`BNB Chain unavailable (HTTP ${response.status}).`);
  const body = await response.json() as { result?: any; error?: { code: number } };
  if (body.error) throw new Error(`BNB Chain request failed (${body.error.code}).`);
  return body.result;
}
export async function tronRead(path: string, body?: object) {
  const key = process.env["UDC_TRONGRID_API_KEY"], auth = process.env["LOVABLE_API_KEY"];
  if (!key || !auth) throw new Error("TronGrid connection is not configured.");
  const response = await fetch(`${TRON_GATEWAY}${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${auth}`, "X-Connection-Api-Key": key, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`TronGrid unavailable (HTTP ${response.status}).`);
  const data = await response.json() as any;
  if (data.Error || data.error || data.success === false) throw new Error("TronGrid could not complete this read.");
  return data;
}
export async function blockchainGateways() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("blockchain_gateways").select("network,address,enabled,verified,checked_at,message");
  if (error) throw new Error("Blockchain payment settings unavailable.");
  return data ?? [];
}
export async function checkChainConnection(chain: Chain) {
  if (chain === "bep20") {
    if (await bscRpc("eth_chainId", []) !== "0x38") throw new Error("Incorrect blockchain network.");
    const block = await bscRpc("eth_getBlockByNumber", ["finalized", false]);
    if (!block?.hash || !block?.number) throw new Error("Finalized block access unavailable.");
  } else {
    const block = await tronRead("/walletsolidity/getnowblock");
    if (!block.blockID) throw new Error("Solidified TRON access unavailable.");
  }
}
function tronBase58(hex: string) {
  const payload = `0x41${hex}` as `0x${string}`;
  const checksum = sha256(sha256(payload)).slice(2, 10);
  return bs58.encode(Uint8Array.from((payload.slice(2) + checksum).match(/../g) ?? [], h => parseInt(h, 16)));
}
function tokenLogs(chain: Chain, receipt: any): { sender: string; receiver: string; units: bigint }[] {
  return (receipt.log ?? receipt.logs ?? []).flatMap((log: any) => {
    const token = String(log.address ?? "").toLowerCase();
    const topics = log.topics ?? [];
    if (token !== CHAIN_TOKEN[chain] || topics.length !== 3 || `0x${String(topics[0]).replace(/^0x/, "")}` !== TRANSFER_TOPIC || !/^(0x)?[0-9a-fA-F]{64}$/.test(String(log.data))) return [];
    const from = String(topics[1]).replace(/^0x/, ""), to = String(topics[2]).replace(/^0x/, "");
    if (!/^[0-9a-fA-F]{64}$/.test(from) || !/^[0-9a-fA-F]{64}$/.test(to)) return [];
    return [{ sender: from.slice(-40).toLowerCase(), receiver: to.slice(-40).toLowerCase(), units: BigInt(`0x${String(log.data).replace(/^0x/, "")}`) }];
  });
}
export async function readChainTransfers(chain: Chain, rawTxid: string): Promise<ChainTransfer[]> {
  const txid = chainTxid(chain, rawTxid);
  if (chain === "trc20") {
    const receipt = await tronRead("/walletsolidity/gettransactioninfobyid", { value: txid });
    if (receipt.id !== txid || receipt.receipt?.result !== "SUCCESS" || !receipt.blockTimeStamp) return [];
    return tokenLogs(chain, receipt).map(t => ({ ...t, txid, timestamp: Number(receipt.blockTimeStamp), confirmed: true, token: CHAIN_TOKEN[chain] }));
  }
  const receipt = await bscRpc("eth_getTransactionReceipt", [txid]);
  if (!receipt || receipt.transactionHash?.toLowerCase() !== txid || receipt.status !== "0x1" || !receipt.blockHash || !receipt.blockNumber) return [];
  const [finalized, block] = await Promise.all([bscRpc("eth_getBlockByNumber", ["finalized", false]), bscRpc("eth_getBlockByNumber", [receipt.blockNumber, false])]);
  if (!finalized?.number || !block?.hash || block.hash !== receipt.blockHash || BigInt(finalized.number) < BigInt(receipt.blockNumber)) return [];
  return tokenLogs(chain, receipt).map(t => ({ ...t, txid, timestamp: Number(BigInt(block.timestamp)) * 1000, confirmed: true, token: CHAIN_TOKEN[chain] }));
}
export async function findChainPayment(chain: Chain, claim: { txid: string; address: string; amount: string; since: number; until: number }) {
  try {
    const rows = await readChainTransfers(chain, claim.txid);
    const matches = rows.filter(t => matchesChainPayment(chain, t, claim));
    // Multi-transfer transactions remain review-only rather than selecting ambiguous evidence.
    if (matches.length !== 1 || rows.filter(t => t.receiver === matches[0]?.receiver).length !== 1) return { ok: false as const, reason: "No unique finalized exact USDT transfer yet; verification will retry." };
    const transfer = matches[0];
    if (!transfer) return { ok: false as const, reason: "Transfer unavailable." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: readError } = await supabaseAdmin.from("blockchain_transfers").select("matched").eq("network", chain).eq("txid", transfer.txid).maybeSingle();
    if (readError) throw new Error("Transfer ledger unavailable.");
    if (existing?.matched) return { ok: false as const, reason: "This blockchain transaction was already used." };
    const { error } = await supabaseAdmin.from("blockchain_transfers").upsert({ network: chain, txid: transfer.txid, sender: chain === "trc20" ? tronBase58(transfer.sender) : `0x${transfer.sender}`, receiver: claim.address, amount: claim.amount, occurred_at: new Date(transfer.timestamp).toISOString(), confirmed: true }, { onConflict: "network,txid" });
    if (error) throw new Error("Could not record verified transfer.");
    return { ok: true as const, txid: transfer.txid, amount: Number(claim.amount) };
  } catch (error) { return { ok: false as const, reason: error instanceof Error ? error.message : "Blockchain verification will retry." }; }
}