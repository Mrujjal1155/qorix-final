import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chainSchema, chainAddress } from "@/lib/blockchain-payment";

export const getBlockchainAdmin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!admin) throw new Error("Forbidden");
  const { blockchainGateways } = await import("@/lib/blockchain.server");
  const { data: transfers } = await context.supabase.from("blockchain_transfers").select("network,txid,sender,receiver,amount,confirmed,matched,occurred_at").order("occurred_at", { ascending: false }).limit(30);
  return { gateways: await blockchainGateways(), transfers: transfers ?? [] };
});
export const saveBlockchainGateway = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((data: { network: string; address: string; enabled: boolean }) => { const network = chainSchema.parse(data.network); return { network, address: chainAddress(network, data.address), enabled: data.enabled === true }; })
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    const { checkChainConnection } = await import("@/lib/blockchain.server");
    let ok = false, message = "";
    try { await checkChainConnection(data.network); ok = true; message = "Connection OK · mainnet and finalized reads verified."; }
    catch (error) { message = error instanceof Error ? error.message : "Connection unavailable."; }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("blockchain_gateways").update({ address: data.address, enabled: ok && data.enabled, verified: ok, checked_at: new Date().toISOString(), message }).eq("network", data.network);
    if (error) throw new Error("Could not save blockchain settings.");
    return { ok, message };
  });