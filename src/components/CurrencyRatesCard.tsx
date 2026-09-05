import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { listCurrencyRates, saveCurrencyRates, deleteCurrencyRate, type CurrencyRateRow } from "@/lib/currency.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function CurrencyRatesCard() {
  const fetchRates = useServerFn(listCurrencyRates);
  const save = useServerFn(saveCurrencyRates);
  const remove = useServerFn(deleteCurrencyRate);

  const { data, refetch } = useQuery({ queryKey: ["currency-rates-admin"], queryFn: () => fetchRates() });
  const [rows, setRows] = useState<CurrencyRateRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setRows(data as CurrencyRateRow[]);
  }, [data]);

  function patch(i: number, next: Partial<CurrencyRateRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...next } : r)));
  }

  async function onSave() {
    setSaving(true);
    try {
      await save({ data: { rows } });
      toast.success("Currency rates saved");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save rates");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(code: string) {
    try {
      await remove({ data: { code } });
      toast.success(`${code} removed`);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove currency");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Currency conversion rates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Product prices are stored in USD. Rates you set here (1 USD = rate) are shown to visitors.
          Any currency without a saved rate automatically falls back to a free live exchange-rate API.
        </p>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.code || i} className="rounded-xl border border-border/70 bg-card/50 p-3">
              <div className="grid gap-3 sm:grid-cols-[90px_1fr_130px_120px]">
                <div className="space-y-1">
                  <Label className="text-xs">Code</Label>
                  <Input
                    value={r.code}
                    onChange={(e) => patch(i, { code: e.target.value.toUpperCase().slice(0, 6) })}
                    className="font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={r.name} onChange={(e) => patch(i, { name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">1 USD =</Label>
                  <Input
                    inputMode="decimal"
                    value={String(r.rate)}
                    onChange={(e) => patch(i, { rate: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Format locale</Label>
                  <Input value={r.locale_tag} onChange={(e) => patch(i, { locale_tag: e.target.value })} />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={r.is_active} onCheckedChange={(c) => patch(i, { is_active: c })} />
                  <span className="text-muted-foreground">Shown to visitors</span>
                </label>
                <Button variant="ghost" size="sm" onClick={() => onDelete(r.code)} disabled={r.code === "USD"}>
                  <Trash2 className="mr-2 size-4" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { code: "", name: "", rate: 1, locale_tag: "en-US", is_active: true, sort_order: prev.length + 1 },
              ])
            }
          >
            <Plus className="mr-2 size-4" /> Add currency
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save currency rates"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
