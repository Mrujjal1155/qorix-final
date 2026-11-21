import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { type Button } from '@/lib/telegram.server';
import { VENDOR_FIELDS, VENDOR_OPTIONS, newVendorDraft, vendorAnswer, vendorBack, vendorDraftSchema, vendorSubmissionSchema, type VendorDraft } from '@/lib/vendor-application';

const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const button = (text: string, action: string, style: 'primary'|'success'|'danger' = 'primary'): Button => ({ text, callback_data: `ven:${action}`, style });
const labels = ['📦 Product Name','⌛ Subscription Duration','🛡 Warranty Terms','💰 Lowest Wholesale Price (Per Unit)','📊 Current Available Stock','🔄 Regular Supply Capacity','📝 Other Details (Optional)'];
const prompts = ['Which product do you want to supply? Select a product or type its name.', 'What is the duration / validity? Select an option or type your own.', 'What warranty / replacement guarantee do you offer?', 'Type your lowest price with currency, e.g. 0.65 USDT or 320 PKR.', 'How much ready stock is currently available?', 'How many units can you supply regularly (daily / weekly)?', 'Choose delivery/account format, type other details, or skip.'];
function view(d: VendorDraft): { text: string; kb: Button[][] } {
  if (d.noteInput) return { text: '📝 <b>Contact / Extra Note</b>\n\nType your contact details or extra note (maximum 1,000 characters). Do not send account passwords or API keys.', kb: [[button('« Back','back'), button('✕ Cancel','cancel','danger')]] };
  if (d.step === 7) {
    const p = d.products[d.page] ?? d.products.at(-1);
    if (!p) throw new Error('No product to review');
    const text = `📋 <b>REVIEW ${d.kind === 'supply' ? 'SUPPLY PROPOSAL' : 'VENDOR APPLICATION'}</b>\n\nProduct ${d.page+1} / ${d.products.length}\n\n<b>${esc(p.name)}</b>\nDuration: ${esc(p.duration)}\nWarranty: ${esc(p.warranty)}\nLowest Price: ${esc(p.price)}\nCurrent Stock: ${esc(p.stock)}\nRegular Supply: ${esc(p.capacity)}\nOther Details: ${esc(p.details || '—')}\n\n${d.note ? `Contact / Note: ${esc(d.note)}\n\n` : ''}Review your details and submit when ready.`;
    const kb: Button[][] = [[button('✅ Submit '+(d.kind==='supply'?'Supply Proposal':'Application'),'submit','success')]];
    if (d.products.length>1) kb.push([button('‹ Previous Product',`page:${Math.max(0,d.page-1)}`),button('Next Product ›',`page:${Math.min(d.products.length-1,d.page+1)}`)]);
    if (d.mode === 'multiple' && d.products.length < 20) kb.push([button('➕ Add Another Product','add')]);
    kb.push([button('📝 Add Contact / Extra Note','note')], [button('✏️ Edit Last Product','back'),button('✕ Cancel','cancel','danger')]);
    return { text, kb };
  }
  const options = VENDOR_OPTIONS[d.step] ?? [];
  const kb: Button[][] = [];
  for (let i=0;i<options.length;i+=2) kb.push(options.slice(i,i+2).map((name,j)=>button(name,`pick:${d.step}:${i+j}`)));
  if (d.step!==3) kb.push([button('✏️ Custom '+(VENDOR_FIELDS[d.step] ?? 'Answer'),'custom')]);
  if (d.step===6) kb.push([button('⏭ Skip Other Details','skip')]);
  kb.push([button('« Back','back'),button('✕ Cancel','cancel','danger')]);
  return { text: `🏪 <b>VENDOR ${d.kind==='supply'?'SUPPLY PROPOSAL':'APPLICATION'}</b>\n\n${d.current.name ? `Product: ${esc(d.current.name)}\n\n` : ''}<b>Step ${d.step+1}/7 — ${labels[d.step]}</b>\n\n${prompts[d.step]}\n\nMaximum ${d.step===6?500:200} characters.`, kb };
}
type State = Record<string, unknown>;
export async function vendorInteraction(owner: number, state: State, action: string | null, input?: string): Promise<{ state: State; text: string; kb: Button[][] }> {
  const { data: vendor, error: vendorError } = await supabaseAdmin.from('approved_vendors').select('is_active').eq('telegram_id',owner).maybeSingle();
  if (vendorError) throw new Error('Could not load vendor status. Please try again.');
  if (action==='open') {
    const { data: recent, error } = await supabaseAdmin.from('vendor_applications').select('status,admin_note').eq('telegram_id',owner).eq('kind','application').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (error) throw new Error('Could not load application status.');
    if (recent?.status==='pending') return { state: { ...state, vendor: null }, text:'⌛ Your vendor application is pending admin review.', kb:[[button('Back to Menu','cancel')]] };
    return { state: { ...state, vendor: null }, text: `🏪 <b>${vendor?.is_active?'APPROVED VENDOR':'BECOME OUR VENDOR'}</b>\n\n${vendor?.is_active?'You can submit new product supply proposals for admin review.':'We welcome reliable digital product suppliers and wholesale vendors.'}\n\nWe will ask for product name, duration, warranty, lowest wholesale price, ready stock, regular supply capacity and other details.\n\nApply with one product or multiple products.${recent?.status==='rejected'?'\n\nYour previous application was rejected. You may submit a new application.':''}`, kb: [[button('📦 '+(vendor?.is_active?'Supply':'Apply')+' — Single Product','start:single')],[button('📚 '+(vendor?.is_active?'Supply':'Apply')+' — Multiple Products','start:multiple')],[button('« Back','cancel','danger')]] };
  }
  if (action==='cancel') return { state: { ...state, vendor: null }, text:'Application closed. No changes were submitted.', kb:[[{text:'🏠 Main Menu',callback_data:'home',style:'primary'}]] };
  let d: VendorDraft;
  if (action?.startsWith('start:')) {
    const mode = action.slice(6);
    if (mode!=='single' && mode!=='multiple') throw new Error('Invalid application mode.');
    d = newVendorDraft(mode,vendor?.is_active?'supply':'application');
  } else {
    const parsed = vendorDraftSchema.safeParse(state['vendor']);
    if (!parsed.success) throw new Error('Open Vendor Application to start again.');
    d = parsed.data;
    if (d.kind==='supply' && !vendor?.is_active) throw new Error('Vendor approval is required.');
    if (input!==undefined) d=vendorAnswer(d,input);
    else if (action==='back') d=vendorBack(d);
    else if (action==='note' && d.step===7) d={...d,noteInput:true};
    else if (action==='add' && d.step===7 && d.mode==='multiple' && d.products.length<20) d={...d,step:0,current:{}};
    else if (action==='skip' && d.step===6) d=vendorAnswer(d,'');
    else if (action?.startsWith('page:') && d.step===7) d={...d,page:Math.max(0,Math.min(d.products.length-1,Number(action.slice(5))||0))};
    else if (action?.startsWith('pick:')) {
      const [,step,index] = action.split(':');
      const option = VENDOR_OPTIONS[d.step]?.[Number(index)];
      if (Number(step)!==d.step || !option) throw new Error('This button belongs to an earlier step.');
      d=vendorAnswer(d,option);
    } else if (action==='submit' && d.step===7 && !d.noteInput) {
      const submission=vendorSubmissionSchema.parse({kind:d.kind,mode:d.mode,products:d.products,note:d.note});
      const { data: id, error } = await supabaseAdmin.rpc('submit_vendor_application',{p_request_id:d.requestId,p_telegram_id:owner,p_kind:submission.kind,p_mode:submission.mode,p_products:submission.products,p_contact_note:submission.note});
      if (error || !id) throw new Error('Could not submit. Check your application status or try again; your draft is saved.');
      return {state:{...state,vendor:null},text:'✅ Submitted successfully. Your '+(d.kind==='supply'?'supply proposal':'vendor application')+' is now waiting for admin review.',kb:[[{text:'🏠 Main Menu',callback_data:'home',style:'primary'}]]};
    } else if (action!=='custom') throw new Error('This action is not available at the current step.');
  }
  return {state:{...state,vendor:d},...view(d)};
}