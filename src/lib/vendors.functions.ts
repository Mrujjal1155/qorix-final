import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { vendorProductSchema } from '@/lib/vendor-application';

export const getVendorApplications = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator(d=>z.object({page:z.number().int().min(0).max(100000),status:z.enum(['all','pending','approved','rejected'])}).parse(d))
  .handler(async ({data,context})=>{
    const {data:admin,error:roleError}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
    if (roleError || !admin) throw new Error('Forbidden');
    let q=context.supabase.from('vendor_applications').select('id,telegram_id,applicant_name,username,kind,mode,products,contact_note,status,admin_note,created_at,reviewed_at',{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false});
    if (data.status!=='all') q=q.eq('status',data.status);
    const {data:rows,error,count}=await q.range(data.page*30,data.page*30+29);
    if(error) throw new Error('Could not load vendor applications.');
    return {rows:(rows??[]).map(r=>({...r,products:z.array(vendorProductSchema).parse(r.products)})),count:count??0};
  });
export const reviewVendorApplication = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator(d=>z.object({id:z.string().uuid(),approve:z.boolean(),note:z.string().trim().max(1000)}).parse(d))
  .handler(async ({data,context})=>{
    const {data:admin,error:roleError}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
    if(roleError || !admin) throw new Error('Forbidden');
    const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
    const {data:status,error}=await supabaseAdmin.rpc('review_vendor_application',{p_id:data.id,p_approve:data.approve,p_admin_id:context.userId,p_note:data.note});
    if(error) throw new Error('Could not review application. Refresh and try again.');
    return {status};
  });