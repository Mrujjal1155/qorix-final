import { z } from "zod";

export const telegramLoginCredentials = z.object({
  code: z.string().regex(/^[a-f0-9]{24}$/),
  secret: z.string().regex(/^[a-f0-9]{48}$/),
});

export function parseTelegramLoginFragment(fragment: string) {
  const [code, secret, extra] = fragment.replace(/^#/, "").split(".");
  if (extra !== undefined) return null;
  const parsed = telegramLoginCredentials.safeParse({ code, secret });
  return parsed.success ? parsed.data : null;
}

export type TelegramWebsiteDestination = "/" | "/store" | "/account" | "/account?deposit=1" | `/store/${string}` | `/checkout?${string}`;

export function websiteQuantity(value: unknown): number {
  const qty = Number(value);
  return Number.isSafeInteger(qty) && qty >= 1 && qty <= 100000 ? qty : 1;
}

export function telegramCheckoutDestination(items: { product_id: string; qty: number }[], step: "details" | "pay"): TelegramWebsiteDestination {
  const item = items.length === 1 ? items[0] : undefined;
  return item ? telegramWebsiteDestination(`/checkout?id=${item.product_id}&qty=${item.qty}&step=${step}`) : "/store";
}

/** Remove single-use credentials but retain the safe shopping destination on reload. */
export function telegramConsentReturnPath(value: unknown): string {
  const next = telegramWebsiteDestination(value);
  return next === "/" ? "/tg" : `/tg?${new URLSearchParams({ next }).toString()}`;
}

/** Post-consent navigation only; one bounded catalogue segment, never arbitrary URLs. */
export function telegramWebsiteDestination(value: unknown): TelegramWebsiteDestination {
  if (value === "/account" || value === "/account?deposit=1" || value === "/store") return value;
  if (typeof value === "string" && value.length <= 240 && /^\/store\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return value as `/store/${string}`;
  if (typeof value === "string" && value.length <= 320) {
    const quantity = value.match(/^(\/store\/[a-z0-9]+(?:-[a-z0-9]+)*)\?stage=quantity&qty=([1-9][0-9]{0,5})$/);
    if (quantity && Number(quantity[2]) <= 100000) return value as `/store/${string}`;
    const checkout = value.match(/^\/checkout\?id=([a-z0-9]+(?:-[a-z0-9]+)*)&qty=([1-9][0-9]{0,5})&step=(details|pay)$/);
    if (checkout && Number(checkout[2]) <= 100000) return value as `/checkout?${string}`;
  }
  return "/";
}

export function telegramWebsiteLoginUrl(site: string, code: string, secret: string, destination: TelegramWebsiteDestination = "/") {
  const url = new URL("/tg", site);
  if (url.protocol !== "https:") throw new Error("Website login requires HTTPS");
  const credentials = telegramLoginCredentials.parse({ code, secret });
  const next = telegramWebsiteDestination(destination);
  if (next !== "/") url.searchParams.set("next", next);
  url.hash = `${credentials.code}.${credentials.secret}`;
  return url.toString();
}

export function loginCodeAvailable(row: { confirmed_at: string | null; claimed_at: string | null; expires_at: string }, now = Date.now()) {
  return Boolean(row.confirmed_at) && !row.claimed_at && Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) > now;
}