export type HomeMessageContent = {
  header: string;
  greeting: string;
  welcome: string;
  choose: string;
  account: Array<[string, string]>;
  wallet: Array<[string, string]>;
  referrals: Array<[string, string]>;
};

export type StartMessageContent = {
  greeting: string;
  /** Label/value cells, already escaped (values usually wrapped in <code> for tap-to-copy). */
  rows: Array<[string, string]>;
  choose: string;
};

export const COMMUNITY_DEFAULTS = {
  group: "https://t.me/QORIXCHAT",
  channel: "https://t.me/qorixlab",
  updates: "https://t.me/qorixstoreupdate",
} as const;

/** Compact Qamify-style start card: greeting, account table, copy hint. */
export function buildStartMessage(content: StartMessageContent): string {
  return `<p>${content.greeting}</p>` +
    `<table bordered striped compact>${content.rows.map(([label, value]) =>
      `<tr><td>${label}</td><td>${value}</td></tr>`).join("")}</table>` +
    `<p>Tap any value to copy it.</p><p>${content.choose}</p>`;
}

/** Plain invite copy button — Telegram already shows a copy glyph, so no emoji. */
export function inviteCopyButton(link: string): { text: string; copy_text: { text: string } } {
  return { text: "Copy invite link", copy_text: { text: link.slice(0, 256) } };
}

/** Three join buttons; only https t.me links are accepted, else the default is used. */
export function communityJoinRow(settings: Record<string, string>): Array<{ text: string; url: string }> {
  const pick = (key: string, fallback: string) => {
    const v = (settings[key] || "").trim();
    return /^https:\/\/t\.me\/[A-Za-z0-9_+/-]+$/.test(v) ? v : fallback;
  };
  return [
    { text: "General Chat", url: pick("community_group_link", COMMUNITY_DEFAULTS.group) },
    { text: "Official Channel", url: pick("community_channel_link", COMMUNITY_DEFAULTS.channel) },
    { text: "Store Updates", url: pick("community_updates_link", COMMUNITY_DEFAULTS.updates) },
  ];
}

/** Only an https image URL may be used as the start banner. */
export function startBannerUrl(settings: Record<string, string>): string | null {
  const v = (settings["home_banner_url"] || "").trim();
  return /^https:\/\/\S+$/.test(v) ? v : null;
}

/** Profile cells are escaped by the caller, preserving configured Premium icons. */
export function buildProfileDetails(content: Pick<HomeMessageContent, "account" | "wallet" | "referrals">): string {
  const table = (heading: string, rows: Array<[string, string]>) =>
    `<h3>${heading}</h3><table bordered striped compact>${rows.map(([label, value]) =>
      `<tr><td>${label}</td><td align="right">${value}</td></tr>`).join("")}</table>`;
  return table("ACCOUNT", content.account) + table("WALLET", content.wallet) + table("REFERRALS", content.referrals);
}

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
  return html.replace(/<summary>([\s\S]*?)<\/summary>/gi, "\n<b>$1</b>\n")
    .replace(/<\/?details\b[^>]*>/gi, "\n")
    .replace(/<h[1-6]>([\s\S]*?)<\/h[1-6]>/gi, "\n<b>$1</b>\n")
    .replace(/<tr>([\s\S]*?)<\/tr>/gi, (_row, cells: string) => {
      const values = Array.from(cells.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi), (cell) => cell[1] ?? "");
      const first = values.shift() ?? "";
      return `${first}${values.length ? `: ${values.join(" | ")}` : ""}\n`;
    })
    .replace(/<\/?table\b[^>]*>/gi, "")
    .replace(/<p>/gi, "").replace(/<\/p>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
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