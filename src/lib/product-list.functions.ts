import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PRODUCT_LIST_EMOJI_KEYS, PRODUCT_LIST_BATCH_SIZE, productListSettingKey } from "@/lib/product-list";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const generateProductList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { offset: number }) => z.object({ offset: z.number().int().min(0).max(1000) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { buildProductList } = await import("@/lib/product-list.server");
    const l = await buildProductList(data.offset);
    return { markdown: l.markdown, products: l.products, emojis: l.emojis, groups: l.groups.length, storeName: l.storeName, botUsername: l.botUsername, offset: l.offset, nextOffset: l.nextOffset, totalProducts: l.totalProducts };
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
  }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { sendProductList } = await import("@/lib/product-list.server");
    return sendProductList(data);
  });
