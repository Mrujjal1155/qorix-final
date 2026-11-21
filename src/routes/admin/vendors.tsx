import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getVendorApplications, reviewVendorApplication } from '@/lib/vendors.functions';
import { AdminShell } from '@/components/AdminShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export const Route=createFileRoute('/admin/vendors')({head:()=>({meta:[
  {title:'Vendor Applications — QORIX Admin'}, {name:'description',content:'Review QORIX vendor applications and product supply proposals.'},
  {property:'og:title',content:'Vendor Applications — QORIX Admin'}, {property:'og:description',content:'Private supplier onboarding and supply review for QORIX administrators.'},
  {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'}, {name:'robots',content:'noindex,nofollow'},
]}),component:VendorsPage});
function VendorsPage(){
  const fetchRows=useServerFn(getVendorApplications); const review=useServerFn(reviewVendorApplication);
  const [status,setStatus]=useState<'all'|'pending'|'approved'|'rejected'>('pending'); const [page,setPage]=useState(0);
  const [selection,setSelection]=useState<{id:string;name:string;approve:boolean;kind:string}|null>(null);
  const [note,setNote]=useState(''); const [busy,setBusy]=useState(false);
  const {data,error,isPending,refetch}=useQuery({queryKey:['vendor-applications',status,page],queryFn:()=>fetchRows({data:{status,page}}),refetchInterval:30000});
  async function confirm(){if(!selection)return;setBusy(true);try{const r=await review({data:{id:selection.id,approve:selection.approve,note}});toast.success(r.status==='approved'?'Approved':'Rejected');setSelection(null);await refetch();}catch(e){toast.error(e instanceof Error?e.message:'Could not review application');}finally{setBusy(false);}}
  return <AdminShell title="Vendor Applications" actions={<Button variant="outline" size="icon" aria-label="Refresh applications" onClick={()=>refetch()}><RefreshCw className="size-4"/></Button>}>
    <div className="flex flex-wrap gap-2 border-b border-border pb-4" role="tablist" aria-label="Application status">{(['pending','approved','rejected','all'] as const).map(s=><Button key={s} role="tab" aria-selected={status===s} variant={status===s?'default':'outline'} onClick={()=>{setStatus(s);setPage(0);}} className="capitalize">{s}</Button>)}</div>
    {isPending&&<p className="py-8 text-muted-foreground">Loading applications…</p>}{error&&<p className="py-8 text-destructive">Could not load applications. <Button variant="outline" onClick={()=>refetch()}>Try again</Button></p>}
    <div className="divide-y divide-border">{data?.rows.map(r=><article key={r.id} className="py-6">
      <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-semibold break-words">{r.applicant_name||'Telegram Vendor'}</h2><p className="text-sm text-muted-foreground break-words">{r.username?'@'+r.username+' · ':''}Telegram {r.telegram_id}</p><p className="text-xs text-muted-foreground">{new Date(r.created_at).toISOString().replace('T',' ').slice(0,19)} UTC</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{r.kind==='supply'?'Supply Proposal':'Vendor Application'}</Badge><Badge variant={r.status==='rejected'?'destructive':'secondary'}>{r.status}</Badge></div></header>
      <div className="mt-4 grid gap-5 md:grid-cols-2">{r.products.map((p,i)=><section key={i} className="min-w-0 border-l-2 border-border pl-4"><h3 className="font-medium break-words">{i+1}. {p.name}</h3><dl className="mt-2 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">{[['Duration',p.duration],['Warranty',p.warranty],['Unit Price',p.price],['Ready Stock',p.stock],['Supply',p.capacity],['Details',p.details||'—']].map(([key,val])=><div key={key} className="contents"><dt className="text-muted-foreground">{key}</dt><dd className="whitespace-pre-wrap break-words">{val}</dd></div>)}</dl></section>)}</div>
      {r.contact_note&&<p className="mt-4 text-sm whitespace-pre-wrap break-words"><span className="font-medium">Contact / Note: </span>{r.contact_note}</p>}{r.admin_note&&<p className="mt-3 text-sm whitespace-pre-wrap break-words"><span className="font-medium">Admin Note: </span>{r.admin_note}</p>}
      {r.status==='pending'&&<div className="mt-4 flex gap-2"><Button onClick={()=>{setSelection({id:r.id,name:r.applicant_name,approve:true,kind:r.kind});setNote('');}}><Check className="mr-2 size-4"/>Approve</Button><Button variant="outline" onClick={()=>{setSelection({id:r.id,name:r.applicant_name,approve:false,kind:r.kind});setNote('');}}><X className="mr-2 size-4"/>Reject</Button></div>}
    </article>)}</div>
    {data&&!data.rows.length&&<p className="py-10 text-muted-foreground">No {status==='all'?'':status+' '}applications.</p>}
    <footer className="flex items-center justify-between gap-3 border-t border-border pt-4"><p className="text-sm text-muted-foreground">{data?.count??0} applications · Page {page+1}</p><div className="flex gap-2"><Button size="icon" variant="outline" aria-label="Previous page" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="size-4"/></Button><Button size="icon" variant="outline" aria-label="Next page" disabled={(page+1)*30>=(data?.count??0)} onClick={()=>setPage(p=>p+1)}><ChevronRight className="size-4"/></Button></div></footer>
    <Dialog open={!!selection} onOpenChange={open=>{if(!open&&!busy)setSelection(null);}}><DialogContent><DialogHeader><DialogTitle>{selection?.approve?'Approve':'Reject'} {selection?.kind==='supply'?'supply proposal':'vendor application'}?</DialogTitle></DialogHeader><p>{selection?.name}</p><p className="text-sm text-muted-foreground">{selection?.approve?(selection.kind==='supply'?'Accept this supply proposal for manual sourcing. Store products, prices and stock remain unchanged.':'Allow this vendor to submit product supply proposals. Store products, prices and stock remain unchanged.'):'This application will not grant supply access.'}</p><label htmlFor="vendor-note" className="text-sm font-medium">Admin note (optional)</label><Textarea id="vendor-note" value={note} maxLength={1000} onChange={e=>setNote(e.target.value)}/><DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setSelection(null)}>Cancel</Button><Button disabled={busy} onClick={confirm}>{busy?'Saving…':'Confirm'}</Button></DialogFooter></DialogContent></Dialog>
  </AdminShell>;
}