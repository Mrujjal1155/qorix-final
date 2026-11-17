import { Check, Clock3, Download, History, Pause, Play, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { colorIndexesFor, supplierBadgeStyle } from '@/lib/supplier-colors';

export interface BuyOrderListItem {
  id: string;
  supplier_id: string;
  product_name: string;
  status: string;
  target: number;
  acquired: number;
  quantity_choices?: number[] | null;
  last_stock?: number | null;
  last_checked_at?: string | null;
  stock_checks?: number | null;
  message?: string | null;
}

interface BuySupplier {
  id: string;
  name: string;
  supported: boolean;
  enabled: boolean;
}

interface Props {
  orders: BuyOrderListItem[];
  suppliers: BuySupplier[];
  busy: boolean;
  monitorReady: boolean;
  onActivate: (order: BuyOrderListItem) => void;
  onAction: (id: string, action: 'pause' | 'cancel') => void;
  onHistory: (order: BuyOrderListItem) => void;
  onDownload: (id: string) => void;
}

const statusStyles = {
  watching: { label: 'Watching', icon: Clock3, badge: 'border-buy-waiting bg-buy-waiting text-buy-waiting-foreground', surface: 'border-l-buy-waiting bg-buy-waiting/5 hover:bg-buy-waiting/10' },
  paused: { label: 'Paused', icon: Pause, badge: 'border-buy-waiting/30 bg-buy-waiting/15 text-foreground', surface: 'border-l-buy-waiting bg-buy-waiting/5 hover:bg-buy-waiting/10' },
  completed: { label: 'Completed', icon: Check, badge: 'border-success bg-success text-success-foreground', surface: 'border-l-success bg-success/5 hover:bg-success/10' },
  cancelled: { label: 'Cancelled', icon: X, badge: 'border-destructive bg-destructive text-destructive-foreground', surface: 'border-l-destructive bg-destructive/5 hover:bg-destructive/10' },
  purchasing: { label: 'Purchasing', icon: Clock3, badge: 'border-buy-waiting bg-buy-waiting text-buy-waiting-foreground', surface: 'border-l-buy-waiting bg-buy-waiting/5 hover:bg-buy-waiting/10' },
  review: { label: 'Review', icon: AlertCircle, badge: 'border-warning bg-warning text-warning-foreground', surface: 'border-l-warning bg-warning/5 hover:bg-warning/10' },
};

function appearance(status: string) {
  return statusStyles[status as keyof typeof statusStyles] ?? statusStyles.review;
}

function checkedAt(value?: string | null) {
  return value ? new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';
}

function Status({ order }: { order: BuyOrderListItem }) {
  const style = appearance(order.status);
  const Icon = style.icon;
  return <Badge variant="outline" className={`shrink-0 gap-1.5 rounded-sm px-2 py-1 ${style.badge}`}><Icon className="size-3 shrink-0"/>{style.label}</Badge>;
}

function OrderActions({ order, supplier, ...props }: Props & { order: BuyOrderListItem; supplier?: BuySupplier }) {
  return <div className="flex flex-wrap items-center gap-1.5">
    {order.status === 'paused' && <Button size="icon" className="size-9 shrink-0" disabled={props.busy || !props.monitorReady || !supplier?.supported || !supplier?.enabled} title="Activate buy order" aria-label="Activate buy order" onClick={() => props.onActivate(order)}><Play className="size-4"/></Button>}
    {order.status === 'watching' && <Button size="icon" variant="outline" className="size-9 shrink-0" disabled={props.busy} title="Pause buy order" aria-label="Pause buy order" onClick={() => props.onAction(order.id, 'pause')}><Pause className="size-4"/></Button>}
    {['watching', 'paused', 'purchasing'].includes(order.status) && <Button size="icon" variant="outline" className="size-9 shrink-0" disabled={props.busy} title="Cancel buy order" aria-label="Cancel buy order" onClick={() => props.onAction(order.id, 'cancel')}><X className="size-4"/></Button>}
    <Button size="icon" variant="outline" className="size-9 shrink-0" title="Attempt history" aria-label="Attempt history" onClick={() => props.onHistory(order)}><History className="size-4"/></Button>
    <Button size="icon" variant="outline" className="size-9 shrink-0" disabled={!order.acquired} title="Download TXT" aria-label="Download TXT" onClick={() => props.onDownload(order.id)}><Download className="size-4"/></Button>
  </div>;
}

function OrderNote({ order }: { order: BuyOrderListItem }) {
  return <>{order.message && <p className="mt-2 break-words text-xs text-destructive">{order.message}</p>}{order.status === 'purchasing' && <p className="mt-2 text-xs text-muted-foreground">Purchase submitted. Do not retry until its outcome is confirmed.</p>}</>;
}

export function SupplierBuyOrderList(props: Props) {
  const colors = colorIndexesFor(props.suppliers.map(s => s.name));
  const supplierFor = (order: BuyOrderListItem) => props.suppliers.find(s => s.id === order.supplier_id);
  const supplierBadge = (supplier?: BuySupplier) => <Badge variant="outline" className="max-w-full rounded-sm break-words whitespace-normal" style={supplierBadgeStyle(colors.get(supplier?.name ?? '') ?? 0)}>{supplier?.name ?? 'Supplier'}</Badge>;

  if (!props.orders.length) return <div className="py-16 text-center text-muted-foreground">No buy orders</div>;

  return <>
    <div className="hidden min-w-0 lg:block">
      <Table aria-label="Supplier buy orders" className="min-w-[700px] table-fixed">
        <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="w-[28%] pl-4">Product / Supplier</TableHead>
          <TableHead className="w-[15%]">Status</TableHead>
          <TableHead className="w-[16%]">Quantity</TableHead>
          <TableHead className="w-[23%]">Stock / Last check</TableHead>
          <TableHead className="w-[18%]">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>{props.orders.map(order => {
          const supplier = supplierFor(order);
          return <TableRow key={order.id} className={`border-l-4 ${appearance(order.status).surface}`}>
            <TableCell className="py-4 pl-4 align-top"><h2 className="break-words font-semibold leading-5">{order.product_name}</h2><div className="mt-2">{supplierBadge(supplier)}</div><OrderNote order={order}/></TableCell>
            <TableCell className="py-4 align-top"><Status order={order}/></TableCell>
            <TableCell className="py-4 align-top"><p className="font-semibold tabular-nums">{order.quantity_choices?.join(' → ') ?? order.target}</p><dl className="mt-2 space-y-1 text-xs"><div className="flex justify-between gap-2"><dt className="text-muted-foreground">Target</dt><dd className="tabular-nums">{order.target}</dd></div><div className="flex justify-between gap-2"><dt className="text-muted-foreground">Acquired</dt><dd className="font-semibold tabular-nums">{order.acquired}</dd></div><div className="flex justify-between gap-2"><dt className="text-muted-foreground">Remaining</dt><dd className="tabular-nums">{order.target - order.acquired}</dd></div></dl></TableCell>
            <TableCell className="py-4 align-top"><p className="font-semibold tabular-nums">{order.last_stock ?? '—'} <span className="text-xs font-normal text-muted-foreground">in stock</span></p><p className="mt-1 text-xs text-muted-foreground"><span className="tabular-nums">{order.stock_checks ?? 0}</span> checks</p><p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{checkedAt(order.last_checked_at)}</p></TableCell>
            <TableCell className="py-4 align-top"><OrderActions {...props} order={order} supplier={supplier}/></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </div>
    <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:hidden">{props.orders.map(order => {
      const supplier = supplierFor(order);
      return <article key={order.id} aria-label={`${order.product_name} — ${order.status}`} className={`min-w-0 overflow-hidden rounded-md border border-l-4 ${appearance(order.status).surface}`}>
        <div className="p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><div className="min-w-0">{supplierBadge(supplier)}</div><Status order={order}/></div>
          <h2 className="mt-3 break-words text-base font-semibold leading-6">{order.product_name}</h2>
          {order.quantity_choices && <p className="mt-1.5 text-sm tabular-nums text-muted-foreground">Priority: <span className="font-medium text-foreground">{order.quantity_choices.join(' → ')}</span></p>}
          <dl className="mt-4 grid grid-cols-3 divide-x border-y py-3 text-sm">{[['Target', order.target], ['Acquired', order.acquired], ['Remaining', order.target - order.acquired]].map(([label, value]) => <div key={label} className="min-w-0 px-3 first:pl-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd></div>)}</dl>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs"><p className="min-w-0 text-muted-foreground">Last stock: <span className="font-semibold tabular-nums text-foreground">{order.last_stock ?? '—'}</span></p><p className="shrink-0 text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{order.stock_checks ?? 0}</span> checks</p></div>
          <p className="mt-1.5 break-words text-xs leading-5 text-muted-foreground">Checked: {checkedAt(order.last_checked_at)}</p>
          <OrderNote order={order}/>
        </div>
        <div className="border-t bg-background/30 px-4 py-3"><OrderActions {...props} order={order} supplier={supplier}/></div>
      </article>;
    })}</div>
  </>;
}