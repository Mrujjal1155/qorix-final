import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({ token: z.string().uuid() });

export type DirectPayResult = { text: string; links: { text: string; url?: string; copy?: string }[] } | { error: string };

function toWeb(res: any): DirectPayResult {
  if (!res || "error" in res) return { error: String(res?.error ?? "Unknown error").replace(/<[^>]+>/g, "") };
  const text = String(res.text)
    .replace(/<tg-emoji[^>]*>.*?<\/tg-emoji>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .trim();
  const links: { text: string; url?: string; copy?: string }[] = [];
  for (const row of res.kb ?? []) for (const b of row) {
    const label = String(b.text ?? "").trim();
    if (typeof b.url === "string" && /^https:\/\//.test(b.url)) links.push({ text: label, url: b.url });
    else if (b.copy_text?.text) links.push({ text: label, copy: String(b.copy_text.text) });
  }
  return { text, links };
}

export const getDirectPay = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any).from("direct_pay_links").select("meta,total,expires_at,started_method,result").eq("id", data.token).maybeSingle();
    if (!row) return { found: false as const };
    const { directPayMethods } = await import("@/lib/bot/engine.server");
    const expired = new Date(row.expires_at).getTime() <= Date.now();
    const items = ((row.meta?.items ?? []) as any[]).map((i) => ({ name: String(i.name ?? i.product_name ?? "Product"), qty: Number(i.qty) || 1 }));
    return {
      found: true as const,
      summary: String(row.meta?.summary ?? ""),
      items,
      total: Number(row.total),
      expiresAt: String(row.expires_at),
      expired,
      methods: expired || row.result ? [] : await directPayMethods(),
      result: row.result ? toWeb(row.result) : null,
    };
  });

export const startDirectPay = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.extend({ method: z.string().min(1).max(32) }).parse(d))
  .handler(async ({ data }) => {
    const { startDirectPayLink } = await import("@/lib/bot/engine.server");
    return toWeb(await startDirectPayLink(data.token, data.method));
  });
