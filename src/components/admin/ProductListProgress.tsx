import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductListProgress, type ProductListProgress as Progress } from "@/lib/product-list.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ProductListProgress() {
  const fetchProgress = useServerFn(getProductListProgress);
  const { data } = useQuery({ queryKey: ["product-list-progress"], queryFn: () => fetchProgress(), refetchInterval: 15000 });
  const [completed, setCompleted] = useState<Progress | null>(null);
  useEffect(() => {
    if (!data || completed) return;
    const result = data.find(p => Number(p.waiting) === 0 && !localStorage.getItem(`plist-completed-${p.id}`));
    if (result) setCompleted(result);
  }, [data,completed]);
  const waiting = (data ?? []).filter(p => Number(p.waiting) > 0);
  return <>
    {waiting.length > 0 && <div className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background px-4 py-3 text-sm shadow-sm">{waiting.map(p => <p key={p.id}>{p.title} · {p.sent}/{p.total} sent · {p.waiting} waiting</p>)}</div>}
    <Dialog open={!!completed} onOpenChange={open => { if (!open && completed) { localStorage.setItem(`plist-completed-${completed.id}`,"1"); setCompleted(null); } }}><DialogContent><DialogHeader><DialogTitle>Product list broadcast complete</DialogTitle></DialogHeader>{completed && <div className="space-y-2 text-sm"><p>{completed.title}</p><p>Sent: {completed.sent} · Not delivered: {completed.failed}</p><p>Groups: {completed.groups_sent}/{completed.groups_total}</p><p>Total recipients: {completed.total}</p></div>}</DialogContent></Dialog>
  </>;
}