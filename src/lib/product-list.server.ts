import { supabaseAdmin } from "@/integrations/supabase/client.server";


import {
  PRODUCT_LIST_EMOJI_KEYS,
  buildProductListMarkdown,
  buildProductListHtml,
  defaultProductListCopy,
  selectListProducts,
  type ProductListMode,
  type ProductListCopy,
  productListSettingKey,
  productListBatch,
  PRODUCT_LIST_BATCH_SIZE,
  type ListProduct,
  type ProductListSnapshot,
} from "@/lib/product-list";

async function loadSettings() {
  const { data } = await (supabaseAdmin as any).from("bot_settings").select("key,value");
  const s: Record<string, string> = {};
  for (const r of (data ?? []) as any[]) s[r.key] = r.value ?? "";
  return s;
}

export async function buildProductList(requestedOffset = 0, mode: ProductListMode = "all", categoryId?: string, ids: string[] = [], copy?: ProductListCopy) {
  const db = supabaseAdmin as any;
  const [s, prods] = await Promise.all([
    loadSettings(),
    db
      .from("products")
      .select("id,name,price,emoji,telegram_custom_emoji_id,featured_rank,sort_order,supplier_id,supplier_stock,category_id")
      .eq("is_active", true)
      .is("owner_reseller_id", null)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(1000),
  ]);
  if (prods.error) throw new Error(prods.error.message);
  const { data: memberships, error: membershipError } = await db.from("product_categories").select("product_id,category_id").limit(10000);
  if (membershipError) throw new Error(membershipError.message);
  const allRows = (prods.data ?? []).map((p: any) => ({ ...p, categoryIds: (memberships ?? []).filter((m: any) => m.product_id === p.id).map((m: any) => m.category_id) }));
  const rows = selectListProducts<any>(allRows, mode, categoryId, ids);
  const inhouseIds = rows.filter((p) => !p.supplier_id).map((p) => p.id);
  const inhouseStock = new Map<string, number>();
  if (inhouseIds.length) {
    const { data: counts } = await db.rpc("stock_counts", { _product_ids: inhouseIds });
    for (const c of (counts ?? []) as any[]) inhouseStock.set(c.product_id, Number(c.available ?? 0));
  }
  // Only products that are actually in stock: supplier rows by supplier_stock, in-house by stock_counters.
  const products: ListProduct[] = rows
    .filter((p) => mode !== "all" || (p.supplier_id ? Number(p.supplier_stock ?? 0) > 0 : (inhouseStock.get(p.id) ?? 0) > 0))
    .map((p) => ({
      name: p.name,
      price: Number(p.price ?? 0),
      emoji: p.emoji,
      custom_emoji_id: p.telegram_custom_emoji_id,
    }));
  const emojis: Record<string, string> = {};
  for (const k of PRODUCT_LIST_EMOJI_KEYS) emojis[k.key] = s[productListSettingKey(k.key)] ?? "";
  const botUsername = s["bot_username"] ?? "";
  const storeName = s["store_name"] || s["shop_name"] || "QORIX";
  const batch = productListBatch(products, requestedOffset);
  const finalCopy = copy ?? defaultProductListCopy(mode, storeName);
  const markdown = buildProductListMarkdown({ storeName, botUsername, products: batch.products, emojis, copy: finalCopy });
  const groups = productListGroups(s);
  return { markdown, ...batch, botUsername, storeName, emojis, groups, copy: finalCopy };
}

function productListGroups(s: Record<string, string>) {
  return [
    ...new Set(
      Object.entries(s)
        .filter(([k]) => k === "announce_chat_id" || k === "announce_chat_inhouse" || k.startsWith("announce_chat_supplier:"))
        .map(([, v]) => String(v ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

export async function sendProductList(snapshot: ProductListSnapshot, adminId: string, requestId: string) {
  if (snapshot.products.length > PRODUCT_LIST_BATCH_SIZE) throw new Error("Product list batch is too large");
  if (!snapshot.products.length) throw new Error("No active products to list");
  const text = buildProductListHtml(snapshot);
  if (new TextEncoder().encode(text).length > 32768) throw new Error("This preview is too long. Shorten the text or select fewer products.");
  const groups = productListGroups(await loadSettings()).filter(g => /^-\d+$/.test(g));
  const keyboard = snapshot.botUsername ? [[{ text: "🛒 Open the shop", url: `https://t.me/${snapshot.botUsername.replace(/^@/, "")}`, style: "success" }]] : undefined;
  const { data, error } = await (supabaseAdmin as any).rpc("enqueue_product_list", {
    _event_key: `broadcast:product-list:${adminId}:${requestId}`,
    _message: { kind: "product_list", text, keyboard, admin_id: adminId, title: snapshot.copy?.title ?? "Product list" },
    _groups: groups.map(Number),
  });
  if (error || !data?.id) throw new Error(error?.message ?? "Could not queue product list");
  return data as { id: string; total: number };
}

export async function productListOptions() {
  const db = supabaseAdmin as any;
  const [categories, products, suppliers, memberships, settings] = await Promise.all([
    db.from("categories").select("id,name").eq("is_active",true).order("sort_order").limit(1000),
    db.from("products").select("id,name,price,emoji,supplier_id,category_id").eq("is_active",true).is("owner_reseller_id",null).order("sort_order").limit(1000),
    db.from("suppliers").select("id,name").order("name").limit(1000),
    db.from("product_categories").select("product_id,category_id").limit(10000), loadSettings(),
  ]);
  for (const r of [categories,products,suppliers,memberships]) if (r.error) throw new Error(r.error.message);
  let savedCopy = null;
  try { savedCopy = JSON.parse(settings["product_list_copy"] || "null"); } catch {}
  const emojis = Object.fromEntries(PRODUCT_LIST_EMOJI_KEYS.map(k => [k.key, settings[productListSettingKey(k.key)] ?? ""]));
  return { categories: categories.data ?? [], products: (products.data ?? []).map((p: any) => ({...p,categoryIds: (memberships.data ?? []).filter((m: any) => m.product_id === p.id).map((m: any) => m.category_id)})), suppliers: suppliers.data ?? [], emojis, savedCopy };
}
