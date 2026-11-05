// Pure converter: line-based stock/price cards → native Telegram rich table.
// Emojis, texts and values stay identical; only the layout changes. The
// sender falls back to "Label: value" lines if Telegram rejects tables.

const ROW = /^(.*?)<b>([^<]+)<\/b>\s{2,}(.+)$/;
const SEPARATOR = /^[━─—\-_]{4,}$/;

export function cardToTable(text: string): string {
  if (/<table\b/i.test(text)) return text;
  const lines = text.split("\n");
  const head = lines.shift() ?? "";
  const out: string[] = [`<h3>${head.replace(/<\/?b>/g, "")}</h3>`];
  let rows: string[] = [];
  const flush = () => {
    if (rows.length) out.push(`<table bordered striped compact>${rows.join("")}</table>`);
    rows = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || SEPARATOR.test(line)) continue;
    const m = ROW.exec(line);
    if (m) rows.push(`<tr><td>${m[1]}${m[2]}</td><td align="right">${m[3].trim()}</td></tr>`);
    else { flush(); out.push(`<p>${line}</p>`); }
  }
  flush();
  return out.join("");
}

/** Group "new sale" post as a table, same icons and wording. */
export function saleTable(o: {
  tag: string; label: string; userIcon: string; who: string; qtyIcon: string; qty: number;
  productIcon: string; product: string; doneIcon: string;
}): string {
  const r = (l: string, v: string) => `<tr><td>${l}</td><td align="right">${v}</td></tr>`;
  return `<h3>${o.tag} ${o.label}</h3><table bordered striped compact>` +
    r(`${o.userIcon} Customer`, `<b>${o.who}</b> just bought`) +
    r(`${o.qtyIcon} Quantity`, `<b>${o.qty}×</b>`) +
    r(`${o.productIcon} Product`, `<b>${o.product}</b>`) +
    `</table><p>${o.doneIcon} <i>Order delivered</i></p>`;
}
