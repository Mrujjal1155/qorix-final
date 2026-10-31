import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkBybitStatus } from "@/lib/bybit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, RefreshCw, KeyRound } from "lucide-react";
import { toast } from "sonner";

export function BybitSetupCard({ values, setValues, onSave }: { values: Record<string, string>; setValues: (values: Record<string, string>) => void; onSave: () => void }) {
  const check = useServerFn(checkBybitStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function verify() {
    setBusy(true);
    try {
      const result = await check({ data: { uid: values.bybit_uid ?? "" } });
      setMessage(result.message);
      setValues({ ...values, bybit_api_verified: result.ok ? "1" : "0", ...(!result.ok ? { bybit_enabled: "0" } : {}) });
      if (result.ok) toast.success(result.message); else toast.error(result.message);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Verification failed"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-6">
    <h2 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="text-primary" /> Bybit Pay</h2>
    <div className="flex items-center justify-between gap-4"><Label htmlFor="bybit-enabled">Bybit Pay</Label><Switch id="bybit-enabled" disabled={values.bybit_api_verified !== "1"} checked={values.bybit_enabled === "1"} onCheckedChange={(enabled) => setValues({ ...values, bybit_enabled: enabled ? "1" : "0" })} /></div>
    <div className="space-y-2"><Label htmlFor="bybit-uid">Receiving Bybit UID</Label><Input id="bybit-uid" inputMode="numeric" value={values.bybit_uid ?? ""} onChange={(event) => setValues({ ...values, bybit_uid: event.target.value, bybit_api_verified: "0", bybit_enabled: "0" })} /></div>
    <div className="flex items-center gap-2 text-sm text-muted-foreground"><KeyRound className="h-4 w-4" /> API Key / Secret: secure project secrets</div>
    <div className="space-y-2"><Label htmlFor="bybit-icon">Telegram Premium emoji ID (optional)</Label><Input id="bybit-icon" value={values.bybit_icon ?? ""} onChange={(event) => setValues({ ...values, bybit_icon: event.target.value })} /></div>
    {message && <p className={values.bybit_api_verified === "1" ? "text-success" : "text-destructive"}>{message}</p>}
    <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={verify} disabled={busy || !values.bybit_uid}><RefreshCw className="h-4 w-4" />{busy ? "Verifying…" : "Verify connection"}</Button><Button onClick={onSave}>Save Bybit settings</Button></div>
  </section>;
}