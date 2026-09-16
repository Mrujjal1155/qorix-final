/** Short human order code shown in Telegram and the admin panel, e.g. ORD-7706FE87. */
export function orderCode(orderId: string) {
  return "ORD-" + String(orderId).replace(/-/g, "").slice(-8).toUpperCase();
}

/** Normalises any user input (ORD-xxxx, xxxx, #12) for matching. */
export function normalizeOrderQuery(q: string) {
  return q.trim().replace(/^#/, "").replace(/^ORD-/i, "").toUpperCase();
}
