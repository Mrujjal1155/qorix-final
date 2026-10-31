import { z } from "zod";
import bs58 from "bs58";
import { sha256, toHex } from "viem";

export const chainSchema = z.enum(["trc20", "bep20"]);
export type Chain = z.infer<typeof chainSchema>;
export const CHAIN_TOKEN = { trc20: "a614f803b6fd780986a42c78ec9c7f77e6ded13c", bep20: "0x55d398326f99059ff775485246999027b3197955" } as const;
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export function chainAddress(chain: Chain, value: string): string {
  const address = value.trim();
  if (chain === "bep20") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address)) throw new Error("Enter a valid BSC wallet address.");
    return address.toLowerCase();
  }
  let bytes: Uint8Array;
  try { bytes = bs58.decode(address); } catch { throw new Error("Enter a valid TRON wallet address."); }
  if (bytes.length !== 25 || bytes[0] !== 0x41) throw new Error("Enter a valid TRON wallet address.");
  const checksum = sha256(sha256(toHex(bytes.slice(0, 21)))).slice(2, 10);
  if (toHex(bytes.slice(21)).slice(2) !== checksum) throw new Error("Invalid TRON address checksum.");
  return address;
}
export function addressHex(chain: Chain, address: string): string {
  const valid = chainAddress(chain, address);
  return chain === "bep20" ? valid.slice(2) : toHex(bs58.decode(valid).slice(1, 21)).slice(2);
}
export function chainTxid(chain: Chain, value: string): string {
  const id = value.trim().toLowerCase();
  if (!(chain === "bep20" ? /^0x[0-9a-f]{64}$/ : /^[0-9a-f]{64}$/).test(id)) throw new Error("Enter a valid blockchain TXID.");
  return id;
}
export function chainUnits(amount: string, chain: Chain): bigint {
  const decimals = chain === "trc20" ? 6 : 18;
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("Invalid USDT amount.");
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.slice(decimals).replace(/0/g, "")) throw new Error("Amount exceeds token precision.");
  return BigInt(whole ?? "0") * 10n ** BigInt(decimals) + BigInt(fraction.slice(0, decimals).padEnd(decimals, "0"));
}
export type ChainTransfer = { txid: string; sender: string; receiver: string; units: bigint; timestamp: number; confirmed: boolean; token: string };
export function matchesChainPayment(chain: Chain, transfer: ChainTransfer, claim: { txid: string; address: string; amount: string; since: number; until: number }) {
  try {
    return transfer.confirmed && transfer.token.toLowerCase() === CHAIN_TOKEN[chain] &&
      transfer.txid === chainTxid(chain, claim.txid) && transfer.receiver === addressHex(chain, claim.address) &&
      transfer.units > 0n && transfer.units === chainUnits(claim.amount, chain) &&
      Number.isFinite(transfer.timestamp) && transfer.timestamp >= claim.since && transfer.timestamp <= claim.until;
  } catch { return false; }
}
export function chainTransactionKey(chain: Chain, txid: string) { return `chain:${chain}:${chainTxid(chain, txid)}`; }