import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { listSuppliers } from "@/lib/supplier.functions";

const TOGGLES: { key: string; label: string; description: string; defaultOn?: boolean }[] = [
  { key: "announce_restock", label: "Restock alerts", description: "Post when stock comes back for a product.", defaultOn: true },
  { key: "announce_low", label: "Low / out of stock alerts", description: "Post when stock drops to the threshold and when it hits zero.", defaultOn: true },
  { key: "announce_new", label: "New product alerts", description: "Post when a new product is turned ON.", defaultOn: true },
  { key: "announce_price", label: "Price change alerts", description: "Post when a product price changes.", defaultOn: true },
  { key: "announce_price_up", label: "Include price increases", description: "Off means only price drops are announced.", defaultOn: false },
  { key: "announce_dm", label: "Bot DM copies", description: "Send the same card to every bot user, not just the group.", defaultOn: true },
];

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

  const isOn = (key: string, defaultOn?: boolean) =>
    (values[key] ?? (defaultOn ? "on" : "off")).toLowerCase() === "on";

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

        <div className="space-y-3">
          {TOGGLES.map((t) => (
            <div key={t.key} className="flex items-start justify-between gap-4 rounded-xl border border-border/70 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
              <Switch
                checked={isOn(t.key, t.defaultOn)}
                onCheckedChange={(c) => setValues({ ...values, [t.key]: c ? "on" : "off" })}
              />
            </div>
          ))}
        </div>

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
