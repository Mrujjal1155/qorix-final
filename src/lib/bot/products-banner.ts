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

/** Only an https image URL may be used as the Flash Deals banner. */
export function flashBannerUrl(settings: Record<string, string>): string | null {
  const v = (settings["flash_banner_url"] || "").trim();
  return /^https:\/\/\S+$/.test(v) ? v : null;
}

/** Flash Deals table: optional banner, then one row per product (icon+name, old, new, off). Cells arrive escaped. */
export function buildFlashDealsCard(opts: {
  banner: string | null;
  title: string;
  rows: Array<[string, string, string, string]>;
  footer: string;
}): string {
  const rows = opts.rows.map((c) => `<tr>${c.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("");
  return (opts.banner ? `<img src="${attr(opts.banner)}"/>` : "") +
    `<table bordered compact><tr><th colspan="4">${opts.title}</th></tr>` +
    `<tr><th>Product</th><th>Was</th><th>Now</th><th>Off</th></tr>${rows}</table>` +
    `<p>${opts.footer}</p>`;
}

/** Only an https image URL may be used as the Categories banner. */
export function categoriesBannerUrl(settings: Record<string, string>): string | null {
  const v = (settings["categories_banner_url"] || "").trim();
  return /^https:\/\/\S+$/.test(v) ? v : null;
}

/** Only an https image URL may be used as a section banner (e.g. profile_banner_url, wallet_banner_url). */
export function sectionBannerUrl(settings: Record<string, string>, key: string): string | null {
  const v = (settings[key] || "").trim();
  return /^https:\/\/\S+$/.test(v) ? v : null;
}

/** Banner image tag (or empty) for the top of a rich message. */
export function bannerImg(url: string | null): string {
  return url ? `<img src="${attr(url)}"/>` : "";
}
