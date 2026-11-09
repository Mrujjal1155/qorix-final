/**
 * Colour rule for the bot's home-screen menu.
 *
 * Telegram inline buttons accept only four native styles:
 * primary (blue), success (green), danger (red) and default
 * (Telegram's normal, unhighlighted button colour).
 *
 * Rule: the two top rows (Shop, Cart, Orders, Wallet, Freebies, Profile)
 * follow the admin's "Main menu" colour, which defaults to blue. The single
 * Referral Store button keeps Telegram's normal colour. The bottom rows
 * (Support, Emails & Trials, Reseller API, Clear Chat) are green.
 */

export type HomeMenuColor = "primary" | "success" | "danger" | "default";

/** Top two rows — the admin's "Main menu" colour applies here. */
export const HOME_MENU_TOP_KEYS = ["shop", "cart", "orders", "wallet", "freebies", "profile"] as const;

/** Bottom rows — always green. */
export const HOME_MENU_GREEN_KEYS = ["support", "emails", "api", "clear"] as const;

/** The single middle button — always Telegram's normal colour. */
export const HOME_MENU_NORMAL_KEYS = ["referral"] as const;

export type HomeMenuKey =
  | (typeof HOME_MENU_TOP_KEYS)[number]
  | (typeof HOME_MENU_GREEN_KEYS)[number]
  | (typeof HOME_MENU_NORMAL_KEYS)[number];

/** Native Telegram style for one home-menu button. */
export function homeMenuColor(key: HomeMenuKey, topColor: HomeMenuColor): HomeMenuColor {
  if ((HOME_MENU_TOP_KEYS as readonly string[]).includes(key)) return topColor;
  if ((HOME_MENU_NORMAL_KEYS as readonly string[]).includes(key)) return "default";
  return "success";
}
