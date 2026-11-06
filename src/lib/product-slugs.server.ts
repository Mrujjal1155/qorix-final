import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string) {
  return UUID_RE.test(v);
}

/** Current readable slug for each product id (service-role read; table has no public access). */
export async function currentSlugs(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabaseAdmin
      .from("product_slugs" as any)
      .select("slug,product_id")
      .eq("is_current", true)
      .in("product_id", ids.slice(i, i + 300));
    for (const r of (data ?? []) as any[]) out[String(r.product_id)] = String(r.slug);
  }
  return out;
}

/** Resolve a /store/<param> value (UUID, current slug or an old slug). */
export async function resolveProductParam(
  param: string,
): Promise<{ id: string; slug: string | null; canonical: boolean } | null> {
  if (isUuid(param)) {
    const slugs = await currentSlugs([param]);
    return { id: param, slug: slugs[param] ?? null, canonical: false };
  }
  const { data } = await supabaseAdmin
    .from("product_slugs" as any)
    .select("product_id,is_current")
    .eq("slug", param.toLowerCase())
    .maybeSingle();
  if (!data) return null;
  const id = String((data as any).product_id);
  if ((data as any).is_current && param === param.toLowerCase()) return { id, slug: param, canonical: true };
  const slugs = await currentSlugs([id]);
  return { id, slug: slugs[id] ?? null, canonical: false };
}
