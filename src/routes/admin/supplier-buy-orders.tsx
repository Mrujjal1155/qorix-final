import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Download, Pause, Play, Plus, X, RefreshCw } from 'lucide-react';
import { AdminShell } from '@/components/AdminShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { changeBuyOrder, createBuyOrder, listBuyOrders, listBuyProducts, readBuyDelivery } from '@/lib/supplier-buy.functions';
import { validBuyChoices } from '@/lib/supplier-buy-rules';
import { colorIndexesFor, supplierBadgeStyle } from '@/lib/supplier-colors';

const buyQuery = queryOptions({queryKey:['supplier-buy-orders'],queryFn:()=>listBuyOrders(),refetchInterval:15000});
export const Route = createFileRoute('/admin/supplier-buy-orders')({
  loader:({context})=>context.queryClient.ensureQueryData(buyQuery),
  head:()=>({meta:[{title:'Supplier Buy Orders — QORIX Admin'},{name:'description',content:'Private supplier stock watches, quantity-limited purchases and account downloads.'},{property:'og:title',content:'Supplier Buy Orders — QORIX Admin'},{property:'og:description',content:'Private supplier purchasing and delivery management.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex, nofollow'}]}),
  component:BuyOrdersPage,
});

function download(text:string,name:string) {
  if(!text) {toast.error('No delivered accounts yet');return;}
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function BuyOrdersPage() {
  const {data}=useSuspenseQuery(buyQuery);
  const qc=useQueryClient();
  const create=useServerFn(createBuyOrder),change=useServerFn(changeBuyOrder),read=useServerFn(readBuyDelivery);
  const [open,setOpen]=useState(false),[supplier,setSupplier]=useState(''),[product,setProduct]=useState(''),[targets,setTargets]=useState(['50','40','35']),[search,setSearch]=useState('');
  const [busy,setBusy]=useState(false),[activate,setActivate]=useState<any>(null),[delivery,setDelivery]=useState<any>(null);
  const colors=colorIndexesFor(data.suppliers.map((s:any)=>s.name));
  const readProducts=useServerFn(listBuyProducts);
  const productQuery=useQuery({queryKey:['supplier-buy-products',supplier],queryFn:()=>readProducts({data:{supplierId:supplier}}),enabled:open&&Boolean(supplier),staleTime:0});
  const products=(productQuery.data??[]).filter((p:any)=>p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const refresh=()=>qc.invalidateQueries({queryKey:['supplier-buy-orders']});
  async function act(id:string,action:'resume'|'pause'|'cancel') {
    setBusy(true);
    try{await change({data:{id,action}});await refresh();toast.success(action==='resume'?'Buy order activated':action==='pause'?'Buy order paused':'Buy order cancelled');}
    catch(e){toast.error(e instanceof Error?e.message:'Action failed');}finally{setBusy(false);setActivate(null);}
  }
  async function save() {
    setBusy(true);
    try{await create({data:{productId:product,choices:targets.map(Number)}});setOpen(false);await refresh();toast.success('Buy order saved — paused');}
    catch(e){toast.error(e instanceof Error?e.message:'Could not save');}finally{setBusy(false);}
  }
  async function allTxt(id:string) {
    try{const result=await read({data:{id}});download(result.text,`supplier-buy-${id}.txt`);}catch{toast.error('Download unavailable');}
  }
  return <AdminShell title="Supplier Buy Orders" actions={<><Button variant="outline" size="icon" title="Refresh" aria-label="Refresh buy orders" onClick={()=>refresh()}><RefreshCw className="size-4"/></Button><Button onClick={()=>setOpen(true)}><Plus className="size-4"/>New buy order</Button></>}>
    {!data.monitorReady && <div role="status" className="mb-6 border-l-4 border-destructive bg-muted px-4 py-3 text-sm"><strong>Fast monitor not connected</strong><p className="mt-1 text-muted-foreground">Buy orders remain paused. No automatic purchases will run until supplier request limits and background monitoring are configured.</p></div>}
    <div className="mb-6 grid grid-cols-2 gap-4 border-b pb-5 sm:grid-cols-4">{[['Watching',data.orders.filter((o:any)=>o.status==='watching').length],['Acquired',data.orders.reduce((n:number,o:any)=>n+o.acquired,0)],['Review',data.orders.filter((o:any)=>['review','purchasing'].includes(o.status)).length],['Completed',data.orders.filter((o:any)=>o.status==='completed').length]].map(([label,value])=><div key={label}><div className="text-sm text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></div>)}</div>
    {data.orders.length===0?<div className="py-16 text-center text-muted-foreground">No buy orders</div>:<div className="grid gap-4 xl:grid-cols-2">{data.orders.map((o:any)=>{
      const s=data.suppliers.find((x:any)=>x.id===o.supplier_id);
      return <article key={o.id} className="min-w-0 rounded-md border bg-card p-5 text-card-foreground">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" style={supplierBadgeStyle(colors.get(s?.name)??0)}>{s?.name??'Supplier'}</Badge><Badge variant={o.status==='review'?'destructive':'secondary'}>{o.status}</Badge></div>
        <h2 className="mt-3 break-words text-lg font-semibold">{o.product_name}</h2>
        {o.quantity_choices&&<p className="mt-2 text-sm text-muted-foreground">Quantity priority: {o.quantity_choices.join(' → ')}</p>}
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">{[['Target',o.target],['Acquired',o.acquired],['Remaining',o.target-o.acquired]].map(([l,v])=><div key={l}><span className="text-muted-foreground">{l}</span><div className="text-xl font-semibold tabular-nums">{v}</div></div>)}</div>
        <div className="mt-4 text-xs text-muted-foreground">Last stock: {o.last_stock??'—'} · Checked: {o.last_checked_at?new Date(o.last_checked_at).toISOString().replace('T',' ').slice(0,19)+' UTC':'—'}</div>
        {o.message&&<p className="mt-2 break-words text-sm text-destructive">{o.message}</p>}
        {o.status==='purchasing'&&<p className="mt-2 text-sm text-muted-foreground">Purchase submitted. Do not retry until its outcome is confirmed.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {o.status==='paused'&&<Button size="sm" disabled={busy||!data.monitorReady||!s?.supported||!s?.enabled} onClick={()=>setActivate(o)}><Play className="size-4"/>Activate</Button>}
          {o.status==='watching'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>act(o.id,'pause')}><Pause className="size-4"/>Pause</Button>}
          {['watching','paused','purchasing'].includes(o.status)&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>act(o.id,'cancel')}><X className="size-4"/>Cancel</Button>}
          <Button size="sm" variant="outline" onClick={()=>setDelivery(o)}>Attempt history</Button>
          <Button size="sm" variant="outline" disabled={!o.acquired} onClick={()=>allTxt(o.id)}><Download className="size-4"/>TXT</Button>
        </div>
      </article>;
    })}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>New supplier buy order</DialogTitle></DialogHeader><div className="space-y-4">
      <div><Label>Supplier</Label><Select value={supplier} onValueChange={v=>{setSupplier(v);setProduct('');setSearch('');}}><SelectTrigger><SelectValue placeholder="Select supplier"/></SelectTrigger><SelectContent>{data.suppliers.map((s:any)=><SelectItem key={s.id} value={s.id}>{s.name}{!s.supported?' · automatic buying unavailable':!s.enabled?' · disabled':''}</SelectItem>)}</SelectContent></Select></div>
      <Input aria-label="Search supplier products" placeholder="Search products" value={search} onChange={e=>setSearch(e.target.value)}/>
      <div><Label>Product</Label><Select value={product} onValueChange={setProduct}><SelectTrigger className="h-auto min-h-10 whitespace-normal"><SelectValue placeholder="Select product"/></SelectTrigger><SelectContent>{products.map((p:any)=><SelectItem key={p.id} value={p.id}>{p.name} · Stock {p.stock}</SelectItem>)}</SelectContent></Select></div>
      {supplier&&<p role="status" className="text-sm text-muted-foreground">{productQuery.isPending?'Loading sold-out products…':productQuery.error?'Products unavailable — try again':`${products.length} sold-out products`}</p>}
      <div className="grid grid-cols-3 gap-3">{['First choice','Second choice','Last choice'].map((label,i)=><div key={label}><Label htmlFor={`buy-quantity-${i}`}>{label}</Label><Input id={`buy-quantity-${i}`} type="number" min={1} max={1000} step={1} value={targets[i]} onChange={e=>setTargets(prev=>prev.map((v,j)=>i===j?e.target.value:v))}/></div>)}</div>
      <Button className="w-full" disabled={busy||!products.some((p:any)=>p.id===product)||!validBuyChoices(targets.map(Number))} onClick={save}>Save paused buy order</Button>
    </div></DialogContent></Dialog>
    <AlertDialog open={Boolean(activate)} onOpenChange={v=>{if(!v)setActivate(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Authorize supplier-wallet spending?</AlertDialogTitle><AlertDialogDescription>{activate?.quantity_choices?`Buy once using quantity priority ${activate.quantity_choices.join(' → ')} for ${activate.product_name}. Stop after one successful purchase; never buy below ${activate.quantity_choices[2]}.`:`Buy up to ${activate?.target-activate?.acquired} more accounts for ${activate?.product_name} in available rounded batches.`} No price ceiling applies. Payment uses the supplier API wallet. Cancellation cannot undo purchases already submitted.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Back</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={()=>activate&&act(activate.id,'resume')}>Authorize &amp; activate</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={Boolean(delivery)} onOpenChange={v=>{if(!v)setDelivery(null);}}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Attempt history</DialogTitle></DialogHeader>{delivery&&<DeliveryHistory order={delivery}/>}</DialogContent></Dialog>
  </AdminShell>;
}

function DeliveryHistory({order}:{order:any}) {
  const read=useServerFn(readBuyDelivery);
  const {data,isPending,error}=useQuery({queryKey:['supplier-buy-delivery',order.id],queryFn:()=>read({data:{id:order.id}})});
  if(isPending)return <p>Loading…</p>;
  if(error)return <p role="alert">Delivery unavailable</p>;
  return <><div className="border-b pb-3 text-sm"><p>Stock checks: {order.stock_checks??0} · Purchase attempts: {data?.batches.length??0}</p><p className="mt-1 text-muted-foreground">Last quantities checked: {order.last_choices_checked?.join(' → ')||'—'}</p></div>{!data?.batches.length?<p className="text-muted-foreground">No purchases yet</p>:<div className="divide-y">{data.batches.map((b:any)=><div key={b.id} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{b.quantity} accounts</strong><p className="text-sm text-muted-foreground">{b.status} · {b.supplier_order_id??'No supplier reference'}</p><p className="text-xs text-muted-foreground">{new Date(b.created_at).toISOString().replace('T',' ').slice(0,19)} UTC</p></div><Button variant="outline" size="icon" title="Download batch TXT" aria-label="Download batch TXT" disabled={!b.items?.length} onClick={()=>download(b.items.join('\n'),`supplier-batch-${b.id}.txt`)}><Download className="size-4"/></Button></div>{b.message&&<p className="mt-2 text-sm text-destructive">{b.message}</p>}</div>)}</div>}</>;
}