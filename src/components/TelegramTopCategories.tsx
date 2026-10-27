import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getTelegramTopCategories, saveTelegramTopCategories } from "@/lib/telegram-top-categories.functions";
import { matchesTopCategory, type TopCategory } from "@/lib/telegram-top-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const QUERY_KEY = ["telegram-top-categories"];
type Product = { id: string; name: string; is_active?: boolean };

export function TelegramTopCategories({ products }: { products: Product[] }) {
  const qc = useQueryClient();
  const getCategories = useServerFn(getTelegramTopCategories);
  const saveCategories = useServerFn(saveTelegramTopCategories);
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => getCategories() });
  const rows = query.data?.categories ?? [];
  const [edit, setEdit] = useState<{ id: string; name: string; keywords: string; is_active: boolean } | null>(null);
  const [remove, setRemove] = useState<TopCategory | null>(null);
  const mutation = useMutation({
    mutationFn: (categories: TopCategory[]) => saveCategories({ data: { categories } }),
    onSuccess: (result) => { qc.setQueryData(QUERY_KEY, result); setEdit(null); setRemove(null); toast.success("Top categories saved"); },
    onError: (error: Error) => toast.error(error.message),
  });
  const disabled = mutation.isPending || query.isPending || query.isError;
  function move(index: number, direction: number) {
    const next = [...rows];
    const target = index + direction;
    const item = next[index];
    const other = next[target];
    if (!item || !other) return;
    next[index] = other;
    next[target] = item;
    mutation.mutate(next);
  }
  function submit() {
    if (!edit) return;
    const category: TopCategory = { ...edit, name: edit.name.trim(), keywords: [...new Set(edit.keywords.split(",").map((word) => word.trim()).filter(Boolean))] };
    if (!category.name || !category.keywords.length) return;
    const exists = rows.some((row) => row.id === edit.id);
    mutation.mutate(exists ? rows.map((row) => row.id === edit.id ? category : row) : [...rows, category]);
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Top Categories</h2>
        <Button disabled={disabled} onClick={() => setEdit({ id: crypto.randomUUID(), name: "", keywords: "", is_active: true })}><Plus className="size-4" /> Add category</Button>
      </div>
      {query.isPending && <p className="text-muted-foreground">Loading…</p>}
      {query.isError && <div className="flex items-center gap-3"><p className="text-destructive">Could not load top categories.</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div>}
      {!query.isPending && !query.isError && !rows.length && <p className="text-muted-foreground">No top categories.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row, index) => (
          <Card key={row.id} className="min-w-0 rounded-md">
            <CardHeader className="flex-row items-start justify-between gap-2">
              <CardTitle className="break-words text-base">{index + 1}. {row.name}</CardTitle>
              <Switch aria-label={`Enable ${row.name}`} checked={row.is_active} disabled={disabled} onCheckedChange={(is_active) => mutation.mutate(rows.map((item) => item.id === row.id ? { ...item, is_active } : item))} />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="break-words text-sm text-muted-foreground">{row.keywords.join(", ")}</p>
              <p className="text-sm font-medium">{products.filter((product) => product.is_active && matchesTopCategory(product.name, row)).length} active products</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" title="Move up" aria-label={`Move ${row.name} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></Button>
                <Button variant="outline" size="icon" title="Move down" aria-label={`Move ${row.name} down`} disabled={disabled || index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></Button>
                <Button variant="outline" size="sm" disabled={disabled} onClick={() => setEdit({ ...row, keywords: row.keywords.join(", ") })}><Pencil className="size-4" /> Edit</Button>
                <Button variant="ghost" size="icon" className="ml-auto text-destructive" title="Delete category" aria-label={`Delete ${row.name}`} disabled={disabled} onClick={() => setRemove(row)}><Trash2 className="size-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={edit !== null} onOpenChange={(open) => { if (!open && !mutation.isPending) setEdit(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{rows.some((row) => row.id === edit?.id) ? "Edit top category" : "Add top category"}</DialogTitle></DialogHeader>
          {edit && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <div className="space-y-2"><Label htmlFor="top-name">Button name</Label><Input id="top-name" required maxLength={80} value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} placeholder="All Lovable Product" /></div>
            <div className="space-y-2"><Label htmlFor="top-keywords">Brand keywords (comma-separated)</Label><Input id="top-keywords" required value={edit.keywords} onChange={(event) => setEdit({ ...edit, keywords: event.target.value })} placeholder="lovable" /></div>
            <div className="flex items-center justify-between"><Label htmlFor="top-enabled">Active</Label><Switch id="top-enabled" checked={edit.is_active} onCheckedChange={(is_active) => setEdit({ ...edit, is_active })} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={mutation.isPending} onClick={() => setEdit(null)}><X className="size-4" /> Cancel</Button><Button type="submit" disabled={mutation.isPending || !edit.name.trim() || !edit.keywords.trim()}><Save className="size-4" /> {mutation.isPending ? "Saving…" : "Save"}</Button></div>
          </form>}
        </DialogContent>
      </Dialog>
      <AlertDialog open={remove !== null} onOpenChange={(open) => { if (!open && !mutation.isPending) setRemove(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {remove?.name}?</AlertDialogTitle><AlertDialogDescription>Products and orders will remain unchanged.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel><AlertDialogAction disabled={mutation.isPending} onClick={(event) => { event.preventDefault(); if (remove) mutation.mutate(rows.filter((row) => row.id !== remove.id)); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </section>
  );
}