import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PRODUCT_LIST_EMOJI_KEYS, PRODUCT_LIST_BATCH_SIZE, productListSettingKey } from "@/lib/product-list";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

const copySchema = z.object({ title: z.string().min(1).max(200), intro: z.string().max(1000), instant: z.string().max(500), warranty: z.string().max(500), bulk: z.string().max(500), channel: z.string().max(200), updates: z.string().max(200), chat: z.string().max(200) }).refine(c => [c.channel,c.updates,c.chat].every(url => !url || /^https:\/\/t\.me\/[A-Za-z0-9_+/-]+$/.test(url)), "Community links must be Telegram HTTPS links");

export const generateProductList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offset: z.number().int().min(0).max(1000), mode: z.enum(["all","category","selected"]).default("all"), categoryId: z.string().uuid().optional(), ids: z.array(z.string().uuid()).max(1000).default([]), copy: copySchema.optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { buildProductList } = await import("@/lib/product-list.server");
    if (data.mode === "category" && !data.categoryId) throw new Error("Choose a category");
    const l = await buildProductList(data.offset, data.mode, data.categoryId, data.ids, data.copy);
    return { markdown: l.markdown, products: l.products, emojis: l.emojis, groups: l.groups.length, storeName: l.storeName, botUsername: l.botUsername, offset: l.offset, nextOffset: l.nextOffset, totalProducts: l.totalProducts, copy: l.copy };
  });

export const saveProductListEmojis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { emojis: Record<string, string> }) => {
    const out: Record<string, string> = {};
    for (const k of PRODUCT_LIST_EMOJI_KEYS) out[k.key] = String(d?.emojis?.[k.key] ?? "").trim().slice(0, 80);
    return { emojis: out };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const rows = Object.entries(data.emojis).map(([k, value]) => ({ key: productListSettingKey(k), value }));
    const { error } = await (context as any).supabase.from("bot_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendProductListPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    products: z.array(z.object({
      name: z.string().min(1).max(1000), price: z.number().finite().nonnegative(),
      emoji: z.string().max(100).nullish(), custom_emoji_id: z.string().regex(/^\d{8,25}$/).nullish(),
    })).min(1).max(PRODUCT_LIST_BATCH_SIZE),
    storeName: z.string().max(200), botUsername: z.string().max(100),
    emojis: z.record(z.string(), z.string().max(80)),
    copy: copySchema.optional(), requestId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { sendProductList } = await import("@/lib/product-list.server");
    return sendProductList(data, context.userId, data.requestId);
  });

export const getProductListOptions = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertAdmin(context);
  const { productListOptions } = await import("@/lib/product-list.server");
  return productListOptions();
});
export const saveProductListCopy = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => copySchema.parse(d)).handler(async ({ context, data }) => {
  await assertAdmin(context);
  const { error } = await context.supabase.from("bot_settings").upsert({ key: "product_list_copy", value: JSON.stringify(data) }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return { ok: true };
});
export type ProductListProgress = { id: string; title: string; total: number; sent: number; failed: number; waiting: number; groups_sent: number; groups_total: number };
export const getProductListProgress = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertAdmin(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("product_list_progress", { _admin_id: context.userId });
  if (error) throw new Error(error.message);
  return data as unknown as ProductListProgress[];
});
