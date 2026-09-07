// Server-only registry of every customizable bot button / tag.
// Admin can override the icon (`ui_icon_<key>`) and the text (`ui_text_<key>`)
// of each entry from Telegram (/admin → UI icons & tags).
import type { Button } from "@/lib/telegram.server";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type UiEntry = { icon: string; label: string; group: string };

export const UI_ELEMENTS = {
  /* ---- shop page ---- */
  shop_flash: { icon: "🎁", label: "Flash Deals", group: "shop" },
  shop_prev: { icon: "⬅️", label: "Prev", group: "shop" },
  shop_next: { icon: "➡️", label: "Next", group: "shop" },
  shop_instock: { icon: "🟢", label: "in stock", group: "shop" },
  flash_tag: { icon: "🏷", label: "SALE", group: "shop" },
  flash_timer: { icon: "⏳", label: "limited offer", group: "shop" },

  /* ---- product page ---- */
  prod_icon_default: { icon: "📦", label: "Default product icon", group: "product" },

  prod_buy: { icon: "🛒", label: "Buy Now", group: "product" },
  prod_addcart: { icon: "➕", label: "Add to Cart", group: "product" },
  prod_refresh: { icon: "🔄", label: "Refresh", group: "product" },
  prod_back: { icon: "⬅️", label: "Back", group: "product" },
  prod_cart: { icon: "🧺", label: "Cart", group: "product" },
  prod_home: { icon: "🏠", label: "Home", group: "product" },
  prod_out: { icon: "❌", label: "Out of stock", group: "product" },
  prod_drop: { icon: "🔥", label: "PRICE DROP", group: "product" },
  prod_price: { icon: "💎", label: "Price", group: "product" },
  prod_save: { icon: "🔻", label: "Save", group: "product" },
  prod_stock: { icon: "📦", label: "In Stock", group: "product" },
  prod_manual: { icon: "📦", label: "Delivery: manual (admin delivers)", group: "product" },
  prod_flash: { icon: "💥", label: "FLASH SALE", group: "product" },
  prod_ends: { icon: "🕐", label: "Ends in", group: "product" },
  prod_sold: { icon: "🔥", label: "sold", group: "product" },
  prod_delivery: { icon: "🛡️", label: "Warranty", group: "product" },
  prod_guide: { icon: "💡", label: "Quick Guide", group: "product" },
  prod_guide_line: { icon: "🚀", label: "How to redeem your offer", group: "product" },
  prod_auto_note: { icon: "⚡", label: "Delivery is automatic after payment confirmation.", group: "product" },
  prod_manual_note: { icon: "🕐", label: "Delivery is done by an admin after payment confirmation.", group: "product" },
  prod_note: { icon: "⚠️", label: "Please note", group: "product" },
  prod_desc: { icon: "📖", label: "Must Read The description First", group: "product" },
  prod_important: { icon: "❗️", label: "Important", group: "product" },
  prod_important_line: { icon: "💳", label: "Important note", group: "product" },
  prod_notify: { icon: "🔔", label: "Notify Me When Available", group: "product" },
  prod_notify_off: { icon: "🔕", label: "Cancel restock alert", group: "product" },
  prod_notify_on_msg: { icon: "🔔", label: "You will be notified as soon as this is back in stock.", group: "product" },
  prod_notify_off_msg: { icon: "🔕", label: "Restock alert cancelled.", group: "product" },
  prod_restock: { icon: "🎉", label: "Back in stock!", group: "product" },
  prod_restock_view: { icon: "🛒", label: "View product", group: "product" },

  /* ---- cart page ---- */
  cart_checkout: { icon: "✅", label: "Checkout", group: "cart" },
  cart_continue: { icon: "🛒", label: "Continue shopping", group: "cart" },
  cart_clear: { icon: "🧹", label: "Clear cart", group: "cart" },
  cart_wallet: { icon: "💰", label: "Wallet", group: "cart" },
  cart_home: { icon: "🏠", label: "Home", group: "cart" },
  cart_total: { icon: "🧾", label: "Total", group: "cart" },

  /* ---- checkout page ---- */
  co_coupon: { icon: "🏷", label: "Apply coupon", group: "checkout" },
  co_coupon_rm: { icon: "🗑", label: "Remove coupon", group: "checkout" },
  co_pay: { icon: "💳", label: "Pay now", group: "checkout" },
  co_subtotal: { icon: "🧾", label: "Subtotal", group: "checkout" },
  co_total: { icon: "💵", label: "Total to pay", group: "checkout" },

  /* ---- payment page ---- */
  pay_balance: { icon: "💰", label: "Pay with balance", group: "payment" },
  pay_payid: { icon: "🪙", label: "Binance Pay ID", group: "payment" },
  pay_bep20: { icon: "💵", label: "USDT BEP-20 (BSC)", group: "payment" },
  pay_trc20: { icon: "💵", label: "USDT TRC-20 (Tron)", group: "payment" },
  pay_bkash: { icon: "📱", label: "bKash", group: "payment" },
  pay_nagad: { icon: "📲", label: "Nagad", group: "payment" },
  pay_rocket: { icon: "🚀", label: "Rocket", group: "payment" },

  pay_back: { icon: "⬅️", label: "Back", group: "payment" },
  pay_title: { icon: "💳", label: "Select Payment Method", group: "payment" },
  pay_item_total: { icon: "🧾", label: "Total", group: "payment" },

  /* ---- wallet page ---- */
  wal_binance: { icon: "🪙", label: "Binance Pay", group: "wallet" },
  wal_usdt: { icon: "💵", label: "USDT crypto (auto)", group: "wallet" },
  wal_bkash: { icon: "📱", label: "bKash", group: "wallet" },
  wal_nagad: { icon: "📲", label: "Nagad", group: "wallet" },
  wal_rocket: { icon: "🚀", label: "Rocket", group: "wallet" },

  wal_redeem: { icon: "🎟", label: "Redeem Code", group: "wallet" },
  wal_history: { icon: "🧾", label: "Transaction History", group: "wallet" },
  wal_home: { icon: "🏠", label: "Home", group: "wallet" },

  /* ---- orders page ---- */
  ord_refresh: { icon: "🔄", label: "Refresh", group: "orders" },
  ord_shop: { icon: "🛒", label: "SHOP", group: "orders" },
  ord_home: { icon: "🏠", label: "Home", group: "orders" },
  ord_my: { icon: "📦", label: "My Orders", group: "orders" },
  ord_id: { icon: "🏷", label: "Order ID", group: "orders" },
  ord_time: { icon: "🕐", label: "Order Time", group: "orders" },
  ord_product: { icon: "🛍", label: "Product Name", group: "orders" },
  ord_price: { icon: "💰", label: "Paid", group: "orders" },
  ord_item: { icon: "📦", label: "Product", group: "orders" },
  ord_view: { icon: "🔎", label: "View", group: "orders" },
  ord_cred: { icon: "🔑", label: "Credential", group: "orders" },
  ord_creds_count: { icon: "🔑", label: "credentials in this order", group: "orders" },
  ord_copy_hint: { icon: "📋", label: "Tap any value to copy", group: "orders" },
  ord_copy_all: { icon: "📋", label: "Copy All", group: "orders" },
  ord_download: { icon: "📩", label: "Download .txt", group: "orders" },
  ord_plain: { icon: "📄", label: "Plain Credentials", group: "orders" },
  ord_reorder: { icon: "🔁", label: "Reorder", group: "orders" },
  ord_back_list: { icon: "«", label: "Back to Orders", group: "orders" },
  ord_prev: { icon: "«", label: "Prev", group: "orders" },
  ord_next: { icon: "»", label: "Next", group: "orders" },
  ord_detail_title: { icon: "🧾", label: "Order Details", group: "orders" },
  ord_done: { icon: "✅", label: "Your order has been completed successfully.", group: "orders" },
  ord_pending: { icon: "⏳", label: "Waiting for manual delivery.", group: "orders" },
  ord_tap_hint: { icon: "💡", label: "Click any order to see its credentials", group: "orders" },
  ord_notfound: { icon: "❌", label: "Order not found.", group: "orders" },
  ord_cancelled: { icon: "🚫", label: "This order was cancelled.", group: "orders" },
  ord_nocreds: { icon: "📭", label: "No credentials attached yet. You will get them here as soon as the order is delivered.", group: "orders" },
  ord_status_done: { icon: "✅", label: "Completed", group: "orders" },
  ord_status_pending: { icon: "⏳", label: "Pending", group: "orders" },
  ord_status_cancelled: { icon: "❌", label: "Cancelled", group: "orders" },
  ord_dl_hint: { icon: "⬇️", label: "Tap the download button below to get all credentials.", group: "orders" },

  /* ---- deposit / Binance Pay ---- */
  dep_binance_title: { icon: "🪙", label: "Binance Pay deposit", group: "deposit" },
  dep_usdt_title: { icon: "💵", label: "USDT deposit", group: "deposit" },
  dep_bdt_title: { icon: "🇧🇩", label: "Mobile banking payment", group: "deposit" },

  dep_pay_title: { icon: "🪙", label: "Binance Pay", group: "deposit" },
  dep_net_title: { icon: "💵", label: "USDT network", group: "deposit" },
  dep_order_tag: { icon: "🧾", label: "Order", group: "deposit" },
  dep_amount: { icon: "💰", label: "Amount to send (tap to copy)", group: "deposit" },
  dep_warn: { icon: "⚠️", label: "The amount must match exactly", group: "deposit" },
  dep_timer: { icon: "⏳", label: "Valid for 2 hours", group: "deposit" },
  dep_submit: { icon: "🧾", label: "Submit transaction ID", group: "deposit" },
  dep_verify: { icon: "✅", label: "I have paid — auto verify", group: "deposit" },
  dep_reverify: { icon: "🔄", label: "Verify again", group: "deposit" },
  dep_cancel: { icon: "❌", label: "Cancel", group: "deposit" },
  dep_wallet: { icon: "⬅️", label: "Wallet", group: "deposit" },
  dep_txid_title: { icon: "🧾", label: "Send the Transaction ID", group: "deposit" },
  dep_bep20: { icon: "💵", label: "BEP-20 (BSC)", group: "deposit" },
  dep_trc20: { icon: "💵", label: "TRC-20 (Tron)", group: "deposit" },
  dep_redeem: { icon: "🎟", label: "Send your redeem code now.", group: "deposit" },
  dep_support: { icon: "🆘", label: "Payment problem? Contact support", group: "deposit" },


  /* ---- quantity ---- */
  qty_title: { icon: "🔢", label: "Select quantity", group: "quantity" },
  qty_custom: { icon: "✏️", label: "Custom quantity", group: "quantity" },
  qty_add1: { icon: "➕", label: "Add 1 to cart", group: "quantity" },
  qty_add5: { icon: "➕", label: "Add 5", group: "quantity" },
  qty_back: { icon: "⬅️", label: "Back", group: "quantity" },

  /* ---- profile / referral ---- */
  home_greet: { icon: "👋", label: "Welcome back", group: "profile" },
  home_choose: { icon: "", label: "Choose an option below to get started.", group: "profile" },
  prof_title: { icon: "👤", label: "PROFILE", group: "profile" },
  prof_username: { icon: "💳", label: "Username", group: "profile" },
  prof_userid: { icon: "🆔", label: "UserID", group: "profile" },
  prof_member: { icon: "🏅", label: "Membership", group: "profile" },
  prof_balance: { icon: "💰", label: "Balance", group: "profile" },
  prof_spent: { icon: "💎", label: "Total Spent", group: "profile" },
  prof_refs: { icon: "🎟", label: "Referrals", group: "profile" },
  prof_earning: { icon: "💸", label: "Referral Earning", group: "profile" },
  prof_link: { icon: "🔗", label: "Referral Link", group: "profile" },
  prof_since: { icon: "📅", label: "Member since", group: "profile" },
  prof_orders_btn: { icon: "📦", label: "Orders", group: "profile" },
  prof_refer_btn: { icon: "📣", label: "Refer & Earn", group: "profile" },
  prof_share_btn: { icon: "📨", label: "Share Referral Link", group: "profile" },
  prof_tiers_btn: { icon: "🏆", label: "View Tiers", group: "profile" },
  prof_back_btn: { icon: "◀️", label: "Back", group: "profile" },
  ref_title: { icon: "📣", label: "REFER & EARN", group: "profile" },
  ref_rate: { icon: "💹", label: "Commission", group: "profile" },
  ref_list_btn: { icon: "👥", label: "My Referrals", group: "profile" },
  ref_share_btn: { icon: "📨", label: "Share on Telegram", group: "profile" },
  ref_copy_btn: { icon: "🔗", label: "Copy Link", group: "profile" },
  ref_profile_btn: { icon: "◀️", label: "Back to Profile", group: "profile" },
  tier_title: { icon: "🏆", label: "LOYALTY TIERS", group: "profile" },
  tier_current: { icon: "✅", label: "Your tier", group: "profile" },
  tier_next: { icon: "🚀", label: "Next tier", group: "profile" },
  tier_spend: { icon: "💰", label: "Your spend", group: "profile" },
  tier_from: { icon: "💰", label: "From", group: "profile" },
  tier_discount: { icon: "🎁", label: "Discount", group: "profile" },
  tier_priority: { icon: "⚡", label: "Priority support", group: "profile" },
  tier_you: { icon: "▶️", label: "(you)", group: "profile" },
  tier_progress: { icon: "📈", label: "Spend", group: "profile" },
  tier_bronze: { icon: "🥉", label: "Bronze", group: "profile" },
  tier_silver: { icon: "🥈", label: "Silver", group: "profile" },
  tier_gold: { icon: "🥇", label: "Gold", group: "profile" },
  tier_platinum: { icon: "💎", label: "Platinum", group: "profile" },
  tier_diamond: { icon: "👑", label: "Diamond", group: "profile" },
  tier_back: { icon: "«", label: "Back", group: "profile" },
  co_tier_line: { icon: "🏆", label: "Tier discount", group: "checkout" },


  /* ---- shared ---- */
  com_back: { icon: "⬅️", label: "Back", group: "common" },
  com_cancel: { icon: "✖️", label: "Cancel", group: "common" },
  com_coupon_ask: { icon: "🏷", label: "Send your coupon code now.", group: "common" },
  com_home: { icon: "🏠", label: "Home", group: "common" },
  com_wallet: { icon: "💰", label: "Wallet", group: "common" },
  com_shop: { icon: "🛒", label: "SHOP", group: "common" },
  com_refresh: { icon: "🔄", label: "Refresh", group: "common" },

  /* ---- support page ---- */
  sup_title: { icon: "🆘", label: "S U P P O R T", group: "support" },
  sup_admin: { icon: "👤", label: "Admin", group: "support" },
  sup_msg_btn: { icon: "💬", label: "Message", group: "support" },
  sup_back: { icon: "◀️", label: "Back", group: "support" },

  /* ---- freebies page ---- */
  free_title: { icon: "🎁", label: "F R E E B I E S", group: "freebies" },
  free_tag: { icon: "🆓", label: "FREE", group: "freebies" },
  free_refresh: { icon: "🔄", label: "Refresh", group: "freebies" },
  free_shop: { icon: "🛒", label: "Open Shop", group: "freebies" },
  free_back: { icon: "◀️", label: "Back", group: "freebies" },

  /* ---- referral store ---- */
  ref_code: { icon: "🎫", label: "Your Code", group: "refstore" },
  ref_credits: { icon: "🎯", label: "Your Credits", group: "refstore" },
  ref_reward: { icon: "🎁", label: "claim", group: "refstore" },
  ref_locked: { icon: "🔒", label: "need", group: "refstore" },
  ref_cash_btn: { icon: "💱", label: "Redeem to Wallet", group: "refstore" },
  ref_purch_btn: { icon: "🧾", label: "My Purchases", group: "refstore" },
  ref_earn_btn: { icon: "💹", label: "Cash Commission", group: "refstore" },
  ref_purch_title: { icon: "🧾", label: "M Y   P U R C H A S E S", group: "refstore" },

  /* ---- transaction history ---- */
  hist_title: { icon: "🧾", label: "T R A N S A C T I O N S", group: "history" },
  hist_in: { icon: "🟢", label: "in", group: "history" },
  hist_out: { icon: "🔴", label: "out", group: "history" },
  hist_prev: { icon: "⬅️", label: "Prev", group: "history" },
  hist_next: { icon: "➡️", label: "Next", group: "history" },
  hist_wallet: { icon: "⬅️", label: "Wallet", group: "history" },
} as const satisfies Record<string, UiEntry>;


export type UiKey = keyof typeof UI_ELEMENTS;

export const UI_GROUPS = ["shop", "product", "cart", "checkout", "payment", "wallet", "orders", "deposit", "quantity", "profile", "refstore", "freebies", "support", "history", "common"] as const;
export type UiGroup = (typeof UI_GROUPS)[number];

export function uiKeysOf(group: string): UiKey[] {
  return (Object.keys(UI_ELEMENTS) as UiKey[]).filter((k) => UI_ELEMENTS[k].group === group);
}

/**
 * Stored icon values support three shapes:
 *   "🔥"                 → plain emoji
 *   "5400280896311944960" → Premium custom emoji (button falls back to default glyph)
 *   "5400280896311944960|🔥" → Premium custom emoji + the glyph to show on buttons
 */
export function parseIconValue(configured: string, fallback: string) {
  const value = (configured ?? "").trim();
  if (!value) return { customId: "", glyph: fallback };
  const [first, ...rest] = value.split("|");
  const id = (first ?? "").trim();
  const alt = rest.join("|").trim();
  if (/^\d{8,}$/.test(id)) return { customId: id, glyph: alt || fallback };
  return { customId: "", glyph: value };
}

function raw(settings: Record<string, string>, key: UiKey) {
  return parseIconValue(settings[`ui_icon_${key}`] ?? "", UI_ELEMENTS[key].icon);
}

/** Admin-customizable label (tag) text. */
export function uiText(settings: Record<string, string>, key: UiKey) {
  const custom = (settings[`ui_text_${key}`] ?? "").trim();
  return custom || UI_ELEMENTS[key].label;
}

/** Icon + label as HTML (Premium custom emoji supported) for message bodies. */
export function uiTag(settings: Record<string, string>, key: UiKey, label?: string) {
  const { customId, glyph } = raw(settings, key);
  const icon = customId
    ? `<tg-emoji emoji-id="${customId}">${esc(glyph)}</tg-emoji>`
    : esc(glyph);
  const text = label ?? uiText(settings, key);
  return `${icon} ${esc(text)}`.trim();
}

/** Only the icon, as HTML. */
export function uiIconHtml(settings: Record<string, string>, key: UiKey) {
  const { customId, glyph } = raw(settings, key);
  return customId ? `<tg-emoji emoji-id="${customId}">${esc(glyph)}</tg-emoji>` : esc(glyph);
}

/** Inline keyboard button honouring the admin's icon + label overrides. */
export function uiBtn(
  settings: Record<string, string>,
  key: UiKey,
  callback_data: string,
  suffix?: string,
): Button {
  const { customId, glyph } = raw(settings, key);
  const label = `${uiText(settings, key)}${suffix ? ` ${suffix}` : ""}`;
  return {
    text: customId ? label.trim() : `${glyph} ${label}`.trim(),
    callback_data,
    ...(customId ? { icon_custom_emoji_id: customId } : {}),
  };
}

/** Inline URL button honouring the admin's icon + label overrides. */
export function uiUrlBtn(settings: Record<string, string>, key: UiKey, url: string): Button {
  const { customId, glyph } = raw(settings, key);
  return {
    text: customId ? uiText(settings, key).trim() : `${glyph} ${uiText(settings, key)}`.trim(),
    url,
    ...(customId ? { icon_custom_emoji_id: customId } : {}),
  };
}
