import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRODUCT_LIST_EMOJI_KEYS, productListSettingKey } from "@/lib/product-list";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const generateProductList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { buildProductList } = await import("@/lib/product-list.server");
    const l = await buildProductList();
    return { markdown: l.markdown, products: l.products, emojis: l.emojis, groups: l.groups.length, storeName: l.storeName, botUsername: l.botUsername };
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
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { sendProductList } = await import("@/lib/product-list.server");
    return sendProductList();
  });
