/**
 * Every icon the bot's Reseller API panel can carry, with the glyph shown when
 * the admin has not set a Premium custom emoji. One source for the bot engine
 * and the website so both sides always render the same artwork.
 */
export const API_ICONS = {
  panel: ["🔌", "API panel header"],
  account: ["🪪", "Account line"],
  status: ["🟢", "Status line"],
  balance: ["💵", "API balance line"],
  discount: ["🏷", "Discount line"],
  orders: ["📦", "API orders line"],
  key: ["🔑", "API key line"],
  alert: ["🔔", "Low-balance alert line"],
  topup: ["💳", "Top Up API Balance button"],
  prices: ["💲", "My Prices button"],
  docs: ["📖", "API Docs button"],
  regen: ["🔄", "Regenerate Key button"],
  revoke: ["🚫", "Revoke Key button"],
} as const;

export type ApiIconKey = keyof typeof API_ICONS;

/** Glyphs the bot types straight into API buttons; no admin icon setting exists for them. */
export const API_PLAIN_GLYPHS = { docs: "📖", guide: "🔗" } as const;
