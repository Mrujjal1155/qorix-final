import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { listSuppliers } from "@/lib/supplier.functions";

/** One place to manage every stock alert rule and where each alert is delivered. */
export function StockAlertSettingsCard({
  values,
  setValues,
  onSave,
}: {
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  onSave: () => void;
}) {
  const fetchSuppliers = useServerFn(listSuppliers);
  const { data: suppliers } = useQuery({ queryKey: ["suppliers-list"], queryFn: () => fetchSuppliers() });


  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Low stock threshold</Label>
            <Input
              inputMode="numeric"
              value={values["announce_low_threshold"] ?? ""}
              onChange={(e) => setValues({ ...values, announce_low_threshold: e.target.value.trim() })}
              placeholder="5"
            />
            <p className="text-xs text-muted-foreground">
              An “almost gone” alert goes out the first time stock drops to this number (default 5).
            </p>
          </div>
          <div className="space-y-1">
            <Label>Default channel / group ID</Label>
            <Input
              value={values["announce_chat_id"] ?? ""}
              onChange={(e) => setValues({ ...values, announce_chat_id: e.target.value.trim() })}
              placeholder="-1001234567890"
            />
            <p className="text-xs text-muted-foreground">Used whenever no specific recipient is set below.</p>
          </div>
        </div>

        <p className="rounded-xl border border-border/70 p-3 text-xs text-muted-foreground">On/off for every alert now lives in Settings → Telegram Notifications.</p>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Recipients per source</p>
            <p className="text-xs text-muted-foreground">
              Leave a field empty to use the default channel/group above.
            </p>
          </div>
          <div className="space-y-1">
            <Label>In-house products</Label>
            <Input
              value={values["announce_chat_inhouse"] ?? ""}
              onChange={(e) => setValues({ ...values, announce_chat_inhouse: e.target.value.trim() })}
              placeholder="Default channel"
            />
          </div>
          {(suppliers ?? []).map((s: any) => (
            <div key={s.id} className="space-y-1">
              <Label>{s.name}</Label>
              <Input
                value={values[`announce_chat_supplier:${s.id}`] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, [`announce_chat_supplier:${s.id}`]: e.target.value.trim() })
                }
                placeholder="Default channel"
              />
            </div>
          ))}
        </div>

        <Button onClick={onSave}>Save stock alert settings</Button>
      </CardContent>
    </Card>
  );
}
