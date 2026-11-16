import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/suppliers/buy-monitor')({
  server: { handlers: { POST: async ({ request }) => {
    const { isCronAuthorized } = await import('@/lib/cron-auth.server');
    if (!(await isCronAuthorized(request))) return new Response('Unauthorized',{status:401});
    const interval=Number(process.env['SUPPLIER_BUY_VERIFIED_INTERVAL_MS'] ?? 0);
    if (!(interval>0 && interval<5000)) return Response.json({ok:false,message:'Fast monitor not configured'},{status:503});
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { processBuyOrders } = await import('@/lib/suppliers/buy-orders.server');
    try { return Response.json({ok:true,...await processBuyOrders(supabaseAdmin)}); }
    catch { return Response.json({ok:false,message:'Monitor needs review'},{status:500}); }
  } } },
});