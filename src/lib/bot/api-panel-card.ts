/** Rich Reseller API card for the bot: optional admin banner, then a bordered info table. Cells arrive escaped. */
const attr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Only an https image URL may be used as the API banner. */
export function apiBannerUrl(settings: Record<string, string>): string | null {
  const v = (settings["api_banner_url"] || "").trim();
  return /^https:\/\/\S+$/.test(v) ? v : null;
}

export function buildApiPanelCard(opts: {
  banner: string | null;
  title: string;
  /** Each row: one or two [label, value] pairs; a single pair spans the full width. */
  rows: Array<Array<[string, string]>>;
  note: string;
}): string {
  const rows = opts.rows.map((pairs) => {
    if (pairs.length === 1) {
      const [l, v] = pairs[0]!;
      return `<tr><td>${l}</td><td colspan="3">${v}</td></tr>`;
    }
    return `<tr>${pairs.map(([l, v]) => `<td>${l}</td><td>${v}</td>`).join("")}</tr>`;
  }).join("");
  return (opts.banner ? `<img src="${attr(opts.banner)}"/>` : "") +
    `<table bordered compact><tr><th colspan="4">${opts.title}</th></tr>${rows}</table>` +
    `<p><i>${opts.note}</i></p>`;
}
