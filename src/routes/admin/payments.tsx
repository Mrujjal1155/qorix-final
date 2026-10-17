import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { decidePayment, listPayments } from "@/lib/admin.functions";
import { AdminShell, money } from "@/components/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Shop Bot Admin" },
      { name: "description", content: "Approve or reject wallet deposit requests from Binance Pay, USDT, bKash and Nagad." },
      { property: "og:title", content: "Payments — Shop Bot Admin" },
      { property: "og:description", content: "Deposit approval queue for your Telegram shop bot wallet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const qc = useQueryClient();
  const fetchPayments = useServerFn(listPayments);
  const decide = useServerFn(decidePayment);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);
  const { data, isFetching } = useQuery({
    queryKey: ["payments", q],
    queryFn: () => fetchPayments({ data: { q } }),
    placeholderData: (prev) => prev,
  });

  async function act(id: string, approve: boolean) {
    try {
      await decide({ data: { id, approve } });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success(approve ? "Approved and credited" : "Rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <AdminShell title="Payments">
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <div className="relative mb-4 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search by user ID or TXID…"
              className="pl-9"
            />
            {isFetching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">…</span>}
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">User</th>
                <th>Method</th>
                <th>Amount</th>
                <th>TXID / sender</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p: any) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2">{p.telegram_id}</td>
                  <td>{p.method}</td>
                  <td>{money(p.amount)}</td>
                  <td className="max-w-xs truncate">{p.txid}</td>
                  <td>
                    <Badge variant={p.status === "approved" ? "default" : "secondary"}>{p.status}</Badge>
                  </td>
                  <td className="space-x-1 text-right">
                    {p.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => act(p.id, true)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => act(p.id, false)}>
                          Reject
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(data ?? []).length === 0 && <p className="py-4 text-sm text-muted-foreground">No payment requests.</p>}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
