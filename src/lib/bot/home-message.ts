export type HomeMessageContent = {
  header: string;
  greeting: string;
  welcome: string;
  choose: string;
  account: Array<[string, string]>;
  wallet: Array<[string, string]>;
  referrals: Array<[string, string]>;
};

/** Cells contain already-escaped inline HTML, including configured custom emojis. */
export function buildHomeMessage(content: HomeMessageContent): string {
  const table = (heading: string, rows: Array<[string, string]>) =>
    `<h3>${heading}</h3><table bordered striped compact>${rows.map(([label, value]) =>
      `<tr><td>${label}</td><td align="right">${value}</td></tr>`).join("")}</table>`;
  return `<p>${content.header}</p><p>${content.greeting}</p>` +
    (content.welcome ? `<p><i>${content.welcome}</i></p>` : "") +
    table("ACCOUNT", content.account) + table("WALLET", content.wallet) + table("REFERRALS", content.referrals) +
    `<h3>Join Community</h3><p>Join for stock alerts and updates.</p>` +
    `<p>👥 <a href="https://t.me/QORIXCHAT">Community Group</a> · 📢 <a href="https://t.me/qorixlab">Official Channel</a></p>` +
    `<p>${content.choose}</p>`;
}

/** Older Bot API servers get readable sections, never unsupported table tags. */
export function homeMessageFallback(html: string): string {
  return html.replace(/<h[1-6]>([\s\S]*?)<\/h[1-6]>/gi, "\n<b>$1</b>\n")
    .replace(/<tr><td>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><\/tr>/gi, "$1: $2\n")
    .replace(/<\/?table\b[^>]*>/gi, "")
    .replace(/<p>/gi, "").replace(/<\/p>/gi, "\n")
    .trim();
}

/** Referral row link: opens Telegram's share sheet, never the bot's own /start. */
export function referralShareAnchor(link: string, shareText: string, label: string): string {
  const href = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;
  return `<a href="${href}">${label}</a>`;
}

/** One-tap copy button for the home screen — copies the user's referral link. */
export function referralCopyButton(link: string): { text: string; copy_text: { text: string }; style: "primary" } {
  return { text: "🔗 Copy Referral Link", copy_text: { text: link.slice(0, 256) }, style: "primary" };
}