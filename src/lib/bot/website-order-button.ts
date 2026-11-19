/**
 * The bot's home-menu "Order from Website" row.
 *
 * Rule: exactly one button, full width, native Telegram blue (primary), and it
 * is a plain https link — tapping it opens the shop website in Telegram's
 * in-app browser. It never carries callback_data, so it cannot change bot
 * state. When no usable website link is configured the row is skipped entirely
 * instead of sending a keyboard Telegram would reject.
 */

export type WebsiteOrderButton = {
  text: string;
  url: string;
  style: "primary";
  icon_custom_emoji_id?: string;
};

/** Build the single full-width blue row from an already-labelled button. */
export function websiteOrderRow(
  button: { text: string; url?: string; icon_custom_emoji_id?: string; style?: string } | null | undefined,
): WebsiteOrderButton[] {
  const url = String(button?.url ?? "").trim();
  if (!/^https?:\/\//.test(url)) return [];
  const icon = String(button?.icon_custom_emoji_id ?? "").trim();
  return [
    {
      text: String(button?.text ?? "").trim(),
      url,
      style: "primary",
      ...(icon ? { icon_custom_emoji_id: icon } : {}),
    },
  ];
}
