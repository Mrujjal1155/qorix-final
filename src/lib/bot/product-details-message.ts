/** All HTML values are escaped/rendered by the existing bot helpers before entry. */
export type ProductDetailContent = {
  heading: string;
  rows: Array<[string, string]>;
  bulk: string;
  sections: Array<{ heading: string; body: string }>;
  deliveryNote: string;
};

/** Native rich details are collapsed locally by Telegram, without a callback or order mutation. */
export function productDetailsMessage(content: ProductDetailContent): string {
  const sections = content.sections.filter(section => section.body.trim());
  const lines = (html: string) => html.replace(/\n/g, "<br/>");
  return `<p>${content.heading}</p>` +
    `<table bordered striped compact>${content.rows.map(([label, value]) =>
      `<tr><td>${label}</td><td>${value}</td></tr>`).join("")}</table>` +
    content.bulk +
    (sections.length ? `<details><summary>📄 About this product</summary>` +
      sections.map(section => `<h4>${section.heading}</h4><p>${lines(section.body)}</p>`).join("") +
      `</details>` : "") +
    `<p><i>${content.deliveryNote}</i></p>`;
}