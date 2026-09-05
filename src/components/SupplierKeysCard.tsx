import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listSuppliers, saveSupplier, testSupplier } from "@/lib/supplier.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/* Settings → Supplier APIs: paste each supplier's API key and base URL in one place. */
export function SupplierKeysCard() {
  const qc = useQueryClient();
  const fetchSuppliers = useServerFn(listSuppliers);
  const save = useServerFn(saveSupplier);
  const test = useServerFn(testSupplier);

  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: () => fetchSuppliers() });
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [bases, setBases] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["suppliers"] });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplier APIs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {(suppliers ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No supplier connection found yet.</p>
        )}

        {(suppliers ?? []).map((s: any) => {
          const baseValue = bases[s.id] ?? s.base_url ?? "";
          return (
            <div key={s.id} className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{s.name}</div>
                <span className="text-xs text-muted-foreground">
                  {s.api_key ? "API key saved" : "no API key yet"}
                  {s.is_enabled ? "" : " · off"}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>API key</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={keys[s.id] ?? ""}
                      placeholder={s.api_key ? "•••••• (saved)" : "paste supplier API key"}
                      onChange={(e) => setKeys((p) => ({ ...p, [s.id]: e.target.value }))}
                    />
                    <Button
                      variant="secondary"
                      disabled={!(keys[s.id] ?? "").trim()}
                      onClick={async () => {
                        try {
                          await save({ data: { id: s.id, api_key: (keys[s.id] ?? "").trim() } });
                          setKeys((p) => ({ ...p, [s.id]: "" }));
                          refresh();
                          toast.success("API key saved");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Save failed");
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>API base URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={baseValue}
                      placeholder="https://panel.example.com"
                      onChange={(e) => setBases((p) => ({ ...p, [s.id]: e.target.value }))}
                    />
                    <Button
                      variant="secondary"
                      disabled={!baseValue.trim() || baseValue.trim() === (s.base_url ?? "")}
                      onClick={async () => {
                        try {
                          await save({
                            data: { id: s.id, base_url: baseValue.trim().replace(/\/+$/, "") },
                          });
                          refresh();
                          toast.success("Base URL saved");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Save failed");
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Panel address only — no /v1 or endpoint at the end.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === s.id}
                  onClick={async () => {
                    setBusy(s.id);
                    try {
                      const r = await test({ data: { id: s.id } });
                      r.ok ? toast.success(r.message) : toast.error(r.message);
                      refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Test failed");
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  Test connection
                </Button>
                <Button
                  variant={s.is_enabled ? "default" : "outline"}
                  size="sm"
                  onClick={async () => {
                    try {
                      await save({ data: { id: s.id, is_enabled: !s.is_enabled } });
                      refresh();
                      toast.success(s.is_enabled ? "Turned off" : "Turned on");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Save failed");
                    }
                  }}
                >
                  {s.is_enabled ? "On" : "Off"}
                </Button>
              </div>

              {s.last_status && <p className="text-xs text-muted-foreground">{s.last_status}</p>}
            </div>
          );
        })}

        <Button asChild variant="outline" size="sm">
          <Link to="/admin/suppliers">Open supplier catalogue</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
