import { uiBtn, uiIconHtml, uiTag, uiKeysOf, parseIconValue } from "./ui.server";

export type SpecialPriceKind = "user" | "reseller";
export type SpecialPriceNoticeStatus = "queued" | "unchanged" | "unreachable" | "not_applicable";
type Product = { id: string; name: string; price: number; emoji?: string | null; telegram_custom_emoji_id?: string | null };
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (value: number) => `$${value.toFixed(2)}`;

export function buildSpecialPriceNotice(kind: SpecialPriceKind, product: Product, price: number, minQty: number, settings: Record<string, string>) {
  const parsed = parseIconValue(product.telegram_custom_emoji_id || product.emoji || "", "📦");
  const productIcon = parsed.customId
    ? `<tg-emoji emoji-id="${escape(parsed.customId)}">${escape(parsed.glyph)}</tg-emoji>`
    : uiIconHtml(settings, "special_product");
  const normal = Number(product.price);
  const comparison = price < normal ? `<s>${usd(normal)}</s> ` : "";
  const text = `<b>${uiTag(settings, "special_title")}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${uiIconHtml(settings, "special_gift")} You've been given <b>YOUR OWN PRICE — ${usd(price)} EACH</b>\n\n` +
    `<blockquote>${productIcon} <b>${escape(product.name)}</b>\n${uiIconHtml(settings, "special_price")} ${comparison}<b>${usd(price)}</b> each</blockquote>\n\n` +
    (minQty > 1 ? `<b>Minimum quantity: ${minQty} items.</b> Below this quantity, your normal price applies.\n\n` : "") +
    `${uiIconHtml(settings, "special_applied")} <i>${kind === "reseller"
      ? "Already applied to your reseller API purchases. No code needed."
      : "Already applied to eligible purchases in this bot. No code needed."}</i>`;
  if (text.length > 4096) throw new Error("Special price notice is too long");
  return {
    kind: "special_price",
    text,
    keyboard: [
      [kind === "reseller" ? uiBtn(settings, "special_api", "api:prices") : { ...uiBtn(settings, "special_buy", `qty:${product.id}`), style: "success" as const }],
      [uiBtn(settings, "special_profile", "profile"), uiBtn(settings, "special_home", "home")],
    ],
  };
}

/** Called only after the server function verifies the authenticated admin role. */
export async function saveSpecialPrice(db: any, kind: SpecialPriceKind, target: string, productId: string, price: number, minQty: number, adminId: string) {
  const keys = uiKeysOf("specialprice").flatMap(key => [`ui_icon_${key}`, `ui_text_${key}`]);
  const [product, config] = await Promise.all([
    db.from("products").select("id,name,price,emoji,telegram_custom_emoji_id").eq("id", productId).maybeSingle(),
    db.from("bot_settings").select("key,value").in("key", keys),
  ]);
  if (product.error || config.error || !product.data) throw new Error("Could not prepare special price; nothing was saved. Please retry.");
  const settings = Object.fromEntries((config.data ?? []).map((row: { key: string; value: string | null }) => [row.key, row.value ?? ""]));
  const message = buildSpecialPriceNotice(kind, product.data, price, minQty, settings);
  const { data, error } = await db.rpc("save_special_price_notice", {
    _kind: kind, _target: target, _product_id: productId, _price: price, _min_qty: minQty, _message: message, _admin_id: adminId,
  });
  if (error || !data?.ok) throw new Error("Could not save the special price and notice. Please refresh before retrying.");
  return data as { ok: true; notice: SpecialPriceNoticeStatus };
}