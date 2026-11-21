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

export function telegramWebsiteLoginUrl(site: string, code: string, secret: string) {
  const url = new URL("/tg", site);
  if (url.protocol !== "https:") throw new Error("Website login requires HTTPS");
  const credentials = telegramLoginCredentials.parse({ code, secret });
  url.hash = `${credentials.code}.${credentials.secret}`;
  return url.toString();
}

export function loginCodeAvailable(row: { confirmed_at: string | null; claimed_at: string | null; expires_at: string }, now = Date.now()) {
  return Boolean(row.confirmed_at) && !row.claimed_at && Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) > now;
}