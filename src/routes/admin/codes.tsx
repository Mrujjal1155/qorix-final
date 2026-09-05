import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { generateCodes, listCodes, listCoupons, saveCoupon, toggleCoupon } from "@/lib/admin.functions";
import { AdminShell, money } from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/codes")({
  head: () => ({
    meta: [
      { title: "Redeem Codes — Shop Bot Admin" },
      { name: "description", content: "Bulk generate gift codes with a balance value and track which ones were redeemed." },
      { property: "og:title", content: "Redeem Codes — Shop Bot Admin" },
      { property: "og:description", content: "Gift code generation for your Telegram shop bot wallet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CodesPage,
});

function CodesPage() {
  const qc = useQueryClient();
  const [count, setCount] = useState(10);
  const [amount, setAmount] = useState(1);
  const fetchCodes = useServerFn(listCodes);
  const gen = useServerFn(generateCodes);
  const { data } = useQuery({ queryKey: ["codes"], queryFn: () => fetchCodes() });

  async function generate() {
    try {
      const r = await gen({ data: { count: Number(count), amount: Number(amount) } });
      qc.invalidateQueries({ queryKey: ["codes"] });
      toast.success(`${r.codes.length} codes generated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <AdminShell title="Redeem Codes">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Generate codes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>How many</Label>
            <Input type="number" className="w-28" value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              className="w-28"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <Button onClick={generate}>Generate</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Code</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Used by</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c: any) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-2 font-mono">{c.code}</td>
                  <td>{money(c.amount)}</td>
                  <td>
                    <Badge variant={c.used_by ? "secondary" : "default"}>{c.used_by ? "used" : "unused"}</Badge>
                  </td>
                  <td>{c.used_by ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CouponsCard />
    </AdminShell>
  );
}

function CouponsCard() {
  const qc = useQueryClient();
  const fetchCoupons = useServerFn(listCoupons);
  const save = useServerFn(saveCoupon);
  const toggle = useServerFn(toggleCoupon);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);
  const [amountOff, setAmountOff] = useState(0);
  const [maxUses, setMaxUses] = useState(0);
  const { data } = useQuery({ queryKey: ["coupons"], queryFn: () => fetchCoupons() });

  async function submit() {
    try {
      await save({ data: { code, percent: Number(percent), amount_off: Number(amountOff), max_uses: Number(maxUses) } });
      setCode("");
      qc.invalidateQueries({ queryKey: ["coupons"] });
      toast.success("Coupon saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Discount coupons</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Code</Label>
            <Input className="w-36 uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SAVE10" />
          </div>
          <div className="space-y-1">
            <Label>Percent %</Label>
            <Input type="number" className="w-24" value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Flat off ($)</Label>
            <Input type="number" step="0.01" className="w-24" value={amountOff} onChange={(e) => setAmountOff(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Max uses (0 = ∞)</Label>
            <Input type="number" className="w-28" value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
          </div>
          <Button onClick={submit}>Save coupon</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Code</th>
                <th>Discount</th>
                <th>Used</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c: any) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-2 font-mono">{c.code}</td>
                  <td>
                    {Number(c.percent) > 0 ? `${c.percent}%` : ""}
                    {Number(c.amount_off) > 0 ? ` ${money(c.amount_off)}` : ""}
                  </td>
                  <td>
                    {c.used_count}
                    {Number(c.max_uses) > 0 ? ` / ${c.max_uses}` : ""}
                  </td>
                  <td>
                    <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "active" : "off"}</Badge>
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await toggle({ data: { id: c.id, is_active: !c.is_active } });
                        qc.invalidateQueries({ queryKey: ["coupons"] });
                      }}
                    >
                      {c.is_active ? "Disable" : "Enable"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

