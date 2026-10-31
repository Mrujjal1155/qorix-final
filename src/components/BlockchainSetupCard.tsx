import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBlockchainAdmin, saveBlockchainGateway } from "@/lib/blockchain.functions";
import { type Chain } from "@/lib/blockchain-payment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Save, Network } from "lucide-react";
import { toast } from "sonner";

export function BlockchainSetupCard() {
  const fetchData = useServerFn(getBlockchainAdmin), save = useServerFn(saveBlockchainGateway);
  const { data, refetch } = useQuery({ queryKey: ["blockchain-admin"], queryFn: () => fetchData() });
  const [drafts, setDrafts] = useState<Partial<Record<Chain, { address: string; enabled: boolean }>>>({});
  const [busy, setBusy] = useState<Chain | null>(null);
  async function submit(network: Chain, verifyOnly: boolean) {
    const saved = data?.gateways.find(g => g.network === network);
    const draft = drafts[network] ?? { address: saved?.address ?? "", enabled: saved?.enabled ?? false };
    setBusy(network);
    try {
      const result = await save({ data: { network, address: draft.address, enabled: verifyOnly ? false : draft.enabled } });
      result.ok ? toast.success(result.message) : toast.error(result.message);
      setDrafts(prev => ({ ...prev, [network]: { ...draft, enabled: result.ok && !verifyOnly && draft.enabled } }));
      await refetch();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save."); }
    finally { setBusy(null); }
  }
  return <section className="space-y-6">
    <h2 className="flex items-center gap-2 text-2xl font-bold"><Network className="text-primary" /> Blockchain USDT</h2>
    {(["trc20", "bep20"] as const).map(network => {
      const saved = data?.gateways.find(g => g.network === network);
      const draft = drafts[network] ?? { address: saved?.address ?? "", enabled: saved?.enabled ?? false };
      return <div key={network} className="space-y-4 border-b border-border pb-6">
        <div className="flex items-center justify-between gap-4"><h3 className="font-semibold">USDT · {network.toUpperCase()}</h3><Switch aria-label={`Enable ${network.toUpperCase()}`} checked={draft.enabled} disabled={!saved?.verified || draft.address !== saved.address} onCheckedChange={enabled => setDrafts(prev => ({ ...prev, [network]: { ...draft, enabled } }))} /></div>
        <Label htmlFor={`${network}-address`}>Self-custody receiving address</Label>
        <Input id={`${network}-address`} value={draft.address} onChange={event => setDrafts(prev => ({ ...prev, [network]: { address: event.target.value, enabled: false } }))} />
        <p className="text-sm text-muted-foreground">{network === "trc20" ? "TronGrid secure connection · free plan: quota depends on your account." : "BNB Chain public RPC · free · 10,000 requests per 5 minutes. No Etherscan paid plan required."}</p>
        <p className={saved?.verified ? "text-success text-sm" : "text-muted-foreground text-sm"}>{saved?.message || "Not verified · disabled"}</p>
        {saved?.checked_at && <p className="text-xs text-muted-foreground">Last checked: {saved.checked_at}</p>}
        <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy !== null || !draft.address} onClick={() => submit(network, true)}><RefreshCw className="h-4 w-4" />Test connection</Button><Button disabled={busy !== null || !draft.address} onClick={() => submit(network, false)}><Save className="h-4 w-4" />Save settings</Button></div>
      </div>;
    })}
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>Only exact USDT transfers to the selected network/address qualify. Send network fees separately: TRX/energy for TRC20, BNB for BEP20. No additional blockchain minimum is imposed.</p>
      <p>Customer TXID is required. Only finalized successful transfers are credited. A public TXID does not prove who sent it; disputed payments need support review.</p>
      <p>Connection testing never activates payments or proves wallet ownership. Never enter a seed phrase or private key.</p>
      <p>BEP20 public RPC cannot list all wallet transfers. The list below contains customer-submitted verified transfers, not complete wallet history.</p>
    </div>
    <h3 className="font-semibold">Verified transfer checks</h3>
    {!data?.transfers.length ? <p className="text-sm text-muted-foreground">No verified transfers yet.</p> : <div className="divide-y divide-border">{data.transfers.map(t => <div key={`${t.network}:${t.txid}`} className="space-y-1 py-3 text-sm"><p>{t.network.toUpperCase()} · {t.amount} USDT · {t.matched ? "Matched" : "Unmatched"}</p><p className="break-all font-mono text-xs">{t.txid}</p><p className="break-all text-xs text-muted-foreground">{t.sender} → {t.receiver}</p></div>)}</div>}
  </section>;
}