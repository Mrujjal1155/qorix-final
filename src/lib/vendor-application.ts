import { z } from 'zod';

const field = z.string().trim().min(1).max(200);
export const vendorProductSchema = z.object({ name: field, duration: field, warranty: field, price: field, stock: field, capacity: field, details: z.string().trim().max(500) });
export type VendorProduct = z.infer<typeof vendorProductSchema>;
export const VENDOR_FIELDS = ['name', 'duration', 'warranty', 'price', 'stock', 'capacity', 'details'] as const;
export const vendorDraftSchema = z.object({ requestId: z.string().uuid(), kind: z.enum(['application', 'supply']), mode: z.enum(['single', 'multiple']), step: z.number().int().min(0).max(7), products: z.array(vendorProductSchema).max(20), current: vendorProductSchema.partial(), note: z.string().max(1000), page: z.number().int().min(0).max(19), noteInput: z.boolean().default(false) });
export type VendorDraft = z.infer<typeof vendorDraftSchema>;
export const vendorSubmissionSchema = z.object({ kind: z.enum(['application','supply']), mode: z.enum(['single','multiple']), products: z.array(vendorProductSchema).min(1).max(20), note: z.string().max(1000) }).refine(v => v.mode !== 'single' || v.products.length === 1);
export function vendorCanSupply(active: boolean, banned: boolean) { return active && !banned; }
export function newVendorDraft(mode: 'single' | 'multiple', kind: 'application' | 'supply'): VendorDraft {
  return { requestId: crypto.randomUUID(), kind, mode, step: 0, products: [], current: {}, note: '', page: 0, noteInput: false };
}
export function vendorAnswer(draft: VendorDraft, raw: string): VendorDraft {
  const answer = raw.trim();
  if (draft.noteInput) {
    if (answer.length > 1000 || !answer) throw new Error('Please enter a contact/note within 1,000 characters.');
    return { ...draft, note: answer, noteInput: false };
  }
  const key = VENDOR_FIELDS[draft.step];
  if (!key) throw new Error('Review the application before submitting.');
  if ((!answer && key !== 'details') || answer.length > (key === 'details' ? 500 : 200)) throw new Error('Please enter a valid answer within the displayed limit.');
  if (key === 'price' && !/\d/.test(answer)) throw new Error('Enter a price with currency, e.g. 0.65 USDT.');
  const current = { ...draft.current, [key]: answer };
  if (key === 'details') {
    const product = vendorProductSchema.parse(current);
    return { ...draft, current: {}, step: 7, products: [...draft.products, product], page: draft.products.length };
  }
  return { ...draft, current, step: draft.step + 1 };
}
export const VENDOR_OPTIONS: readonly (readonly string[])[] = [
  ['Gemini Advanced','Canva Pro','ChatGPT Plus','YouTube Premium','Netflix','Surfshark VPN'],
  ['1 Month','3 Months','6 Months','1 Year','Lifetime'],
  ['Full Warranty','Replacement Warranty','25–28 Days Warranty','Login Warranty Only','No Warranty'],
  [], ['10 - 50 pcs','50 - 200 pcs','200 - 500 pcs','500+ pcs'],
  ['10 - 30 / day','50 - 100 / day','100 - 500 / day','Weekly Restock'],
  ['Activation Link','Email : Password','Team / Family Invite','Private Account'],
];
export function vendorBack(d: VendorDraft): VendorDraft {
  if (d.noteInput) return { ...d, noteInput: false };
  if (d.step === 7) {
    const last = d.products.at(-1);
    if (!last) return d;
    return { ...d, step: 6, current: last, products: d.products.slice(0,-1) };
  }
  return { ...d, step: Math.max(0,d.step - 1) };
}