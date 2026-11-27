/** All Products banner card for the bot: admin banner + bordered table, sent as one rich message with the buttons. Cells arrive escaped. */
const attr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Only an https image URL may be used as the All Products banner. */
export function productsBannerUrl(settings: Record<string, string>): string | null {
  const v = (settings["products_banner_url"] || "").trim();
  return /^https:\/\/\S+$/.test(v) ? v : null;
}

export function buildProductsBannerCard(opts: {
  banner: string;
  title: string;
  rows: Array<[string, string]>;
  note: string;
}): string {
  const rows = opts.rows.map(([l, v]) => `<tr><td>${l}</td><td>${v}</td></tr>`).join("");
  return `<img src="${attr(opts.banner)}"/>` +
    `<table bordered compact><tr><th colspan="2">${opts.title}</th></tr>${rows}</table>` +
    `<p><i>${opts.note}</i></p>`;
}
