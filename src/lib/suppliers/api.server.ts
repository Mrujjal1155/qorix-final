// Server-only client for reseller supplier APIs (Qamify-compatible).
// Never expose supplier names/branding to end users — this is internal only.

export type SupplierRow = {
  id: string;
  key: string;
  name: string;
  base_url: string;
  api_key?: string | null;
  markup_percent?: number | null;
  markup_fixed?: number | null;
};

export type SupplierProduct = {
  external_id: string;
  name: string;
  description: string | null;
  cost_price: number;
  stock: number;
  currency: string;
  min_qty: number;
  raw: any;
};

/** Extra product details pulled out of the complete supplier payload. */
export type SupplierDetails = {
  image_url: string | null;
  delivery_time: string | null;
  important_note: string | null;
  quick_guide: string | null;
  description: string | null;
};

const DETAIL_KEYS = {
  description: [
    "description",
    "description_text",
    "description_html",
    "details",
    "product_details",
    "product_detail",
    "long_description",
    "short_description",
    "about",
    "overview",
    "content",
    "body",
    "info",
  ],
  image: [
    "delivery_media",
    "image_url",
    "imageUrl",
    "image",
    "images",
    "thumbnail",
    "thumb",
    "thumbnail_url",
    "icon_url",
    "banner",
    "banner_url",
    "photo",
    "photo_url",
    "picture",
    "cover",
    "cover_url",
    "media",
    "preview",
    "preview_url",
  ],

  delivery: ["expiration", "expiry", "warranty", "warranty_text", "warranty_period", "duration", "validity", "delivery_time", "delivery_speed"],
  important: [
    "important_note",
    "important_notes",
    "important",
    "note",
    "notes",
    "terms",
    "terms_of_use",
    "warning",
    "policy",
    "rules",
  ],
  guide: [
    "quick_guide",
    "quick_setup",
    "setup",
    "setup_guide",
    "guide",
    "instructions",
    "instruction",
    "how_to_use",
    "how_to_setup",
    "how_to_activate",
    "usage",
    "usage_instructions",
    "manual",
    "tutorial",
    "redeem_instructions",
    "redeem_guide",
    // Vexoran Shoppie sends the activation walkthrough here.
    "delivery_instructions",
    "delivery_instruction",
    "activation_instructions",
    "activation_guide",
  ],
} as const;

function keyName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanSupplierText(value: string) {
  return value
    // Keep the supplier's Premium emoji: turn their markup into the same
    // `{ce:id:glyph}` token the rest of the pipeline understands, so the bot can
    // re-emit a real <tg-emoji> instead of dropping the icon.
    .replace(
      /<tg-emoji[^>]*emoji-id=["']?(\d+)["']?[^>]*>(.*?)<\/tg-emoji>/gis,
      (_m, id: string, glyph: string) => `{ce:${id}:${glyph.replace(/<[^>]+>/g, "").trim()}}`,
    )
    .replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/gis, "$1")

    .replace(/<br\s*\/?>(?=.)/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textValue(value: any): string | null {
  if (typeof value === "string") {
    const text = cleanSupplierText(value);
    return text || null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const values = value.map(textValue).filter((item): item is string => Boolean(item));
    return values.length ? values.join("\n") : null;
  }
  return null;
}

function valuesForKeys(raw: any, keys: readonly string[], depth = 0): string[] {
  if (!raw || depth > 4 || typeof raw !== "object") return [];
  const wanted = new Set(keys.map(keyName));
  const values: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (wanted.has(keyName(key))) {
      const text = textValue(value);
      if (text) values.push(text);
    }
  }
  for (const value of Object.values(raw)) {
    if (value && typeof value === "object") values.push(...valuesForKeys(value, keys, depth + 1));
  }
  return values;
}

function firstValue(raw: any, keys: readonly string[]) {
  return valuesForKeys(raw, keys)[0] ?? null;
}

function longestValue(raw: any, keys: readonly string[]) {
  return valuesForKeys(raw, keys).sort((a, b) => b.length - a.length)[0] ?? null;
}

const ALL_HEADINGS = [
  "important note",
  "important notes",
  "important",
  "note",
  "notes",
  "warning",
  "terms",
  "policy",
  "quick guide",
  "quick setup",
  "setup",
  "instruction",
  "instructions",
  "how to use",
  "how to fix errors",
  "usage",
  "guide",
  "redeem instructions",
  "redeem link",
  "login link",
  "product details",
  "details",
  "description",
  "duration",
  "expiration",
  "expiry",
  "validity",
  "warranty",
  // FatBunny Hub writes these as plain uppercase lines with no colon.
  "how to place an order",
  "how to place order",
  "how to order",
  "how to buy",
  "order steps",
  "requirements",
  "requirement",
  "benefits",
  "benefit",
];

const escapeRe = (item: string) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Optional leading bullet / emoji decoration before a heading word. */
const LEAD = "(?:[^\\p{L}\\p{N}\\n]{0,6})";

function headingRe(headings: string[], anchored: boolean) {
  // The colon is optional when the heading sits alone on its own line
  // ("🛒 HOW TO PLACE AN ORDER"), which is how FatBunny Hub formats them.
  return new RegExp(
    `${anchored ? "(?:^|\\n)" : "\\n"}[ \\t]*${LEAD}[ \\t]*(?:${headings.map(escapeRe).join("|")})[ \\t]*(?::[ \\t]*\\n?|[ \\t]*\\n)`,
    "iu",
  );
}


/**
 * Pull a labelled section ("🔗 Instructions: …") out of the supplier's
 * description and return the section plus the description without it, so the
 * bot never prints the same block twice.
 */
function splitSection(
  text: string | null,
  headings: string[],
  singleLine = false,
): { value: string | null; rest: string | null } {
  if (!text) return { value: null, rest: text };
  const match = headingRe(headings, true).exec(text);
  if (!match || match.index < 0) return { value: null, rest: text };
  const start = match.index + match[0].length;
  const remainder = text.slice(start);

  if (singleLine) {
    // "⏳ Expiration: 24 hours" — the value is the rest of that one line only.
    const line = remainder.split("\n")[0]?.trim() ?? "";
    if (!line) return { value: null, rest: text };
    const rest = (text.slice(0, match.index) + remainder.slice(line.length))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { value: line, rest: rest || null };
  }

  const next = headingRe(
    ALL_HEADINGS.filter((item, index, all) => all.indexOf(item) === index),
    false,
  ).exec(remainder);
  const body = (next ? remainder.slice(0, next.index) : remainder).trim();
  if (!body) return { value: null, rest: text };
  const rest = (text.slice(0, match.index) + (next ? remainder.slice(next.index) : ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { value: body, rest: rest || null };
}




/** Pull the first usable image URL out of strings, arrays or `{ url }` objects. */
function imageValue(raw: any, depth = 0): string | null {
  if (!raw || depth > 4 || typeof raw !== "object") return null;
  const wanted = new Set(DETAIL_KEYS.image.map(keyName));
  const pick = (value: any): string | null => {
    if (typeof value === "string") {
      const url = value.trim();
      return /^(https?:\/\/|data:image\/)/i.test(url) ? url : null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = pick(item);
        if (found) return found;
      }
      return null;
    }
    if (value && typeof value === "object") {
      for (const k of ["url", "src", "href", "large", "original", "full", "path"]) {
        const found = pick((value as any)[k]);
        if (found) return found;
      }
    }
    return null;
  };
  for (const [key, value] of Object.entries(raw)) {
    if (wanted.has(keyName(key))) {
      const found = pick(value);
      if (found) return found;
    }
  }
  for (const value of Object.values(raw)) {
    if (value && typeof value === "object") {
      const found = imageValue(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Normalise Qamify/Vexoran/Canboso fields while retaining the supplier's full text. */
export function detailsFromRaw(raw: any): SupplierDetails {
  const r = raw ?? {};
  let description = longestValue(r, DETAIL_KEYS.description);

  // Sections that live inside the description are moved out of it, so the bot
  // shows "Description / Important / Quick guide" once each instead of a wall
  // of duplicated text.
  const take = (
    keys: readonly string[],
    headings: string[],
    singleLine = false,
    allowEmptyRest = false,
  ) => {
    const direct = firstValue(r, keys);
    if (direct) return direct;
    const split = splitSection(description, headings, singleLine);
    // Never empty the description entirely — a supplier whose whole text is one
    // labelled block should keep showing that text as the description, unless
    // that block is clearly a step-by-step guide (FatBunny Hub) which reads far
    // better under its own "Quick Guide" card.
    if (!split.value || (!split.rest && !allowEmptyRest)) return null;
    description = split.rest;
    return split.value;
  };

  let important = take(DETAIL_KEYS.important, ["important note", "important notes", "important", "note", "notes", "warning"]);
  const guide = take(
    DETAIL_KEYS.guide,
    [
      "quick guide",
      "quick setup",
      "setup",
      "instruction",
      "instructions",
      "how to use",
      "redeem instructions",
      "guide",
      // FatBunny Hub puts the ordering walkthrough under these headings.
      "how to place an order",
      "how to place order",
      "how to order",
      "how to buy",
      "order steps",
      "requirements",
      "requirement",
    ],
    false,
    true,
  );

  const duration = take(DETAIL_KEYS.delivery, ["duration", "warranty", "validity", "expiration", "expiry"], true);

  // Newer supplier APIs (Vexoran 2026) send a machine-readable warranty flag
  // ("none" | "full") instead of free text. Turn it into a readable line.
  const warrantyRaw = String(firstValue(r, ["warranty_type", "warrantyType"]) ?? "").trim().toLowerCase();
  let warrantyLabel =
    warrantyRaw === "full" ? "Full warranty" : warrantyRaw === "none" ? "No warranty" : null;

  // FatBunny Hub carries the warranty only inside the product title
  // ("… 3 months full warranty", "… warranty not included").
  if (!warrantyLabel) {
    const title = String(firstValue(r, ["name", "title", "product_name"]) ?? "");
    if (/warranty\s*(?:is\s*)?not\s*included|no\s*warranty|without\s*warranty/i.test(title)) {
      warrantyLabel = "No warranty";
    } else if (/full\s*warranty/i.test(title)) {
      warrantyLabel = "Full warranty";
    } else {
      const span = /(\d+)\s*(day|week|month|year)s?\s*warranty/i.exec(title);
      if (span) warrantyLabel = `${span[1]} ${span[2]!.toLowerCase()}${Number(span[1]) > 1 ? "s" : ""} warranty`;
    }
  }




  // Suppliers often write the warning as a bare "⚠️ …" paragraph with no label.
  if (!important && description) {
    const blocks = description.split(/\n{2,}/);
    const index = blocks.findIndex((b) => /^\s*(⚠️?|❗️?|🚨)/u.test(b));
    if (index >= 0) {
      important = (blocks[index] ?? "").replace(/^\s*(⚠️?|❗️?|🚨)\s*/u, "").trim() || null;
      const rest = blocks.filter((_, i) => i !== index).join("\n\n").trim();
      if (important && rest) description = rest;
      else important = null;
    }
  }

  return {
    description: description?.trim() || null,
    image_url: imageValue(r),
    delivery_time: duration || warrantyLabel,
    important_note: important,
    quick_guide: guide,
  };


}


function apiKeyFor(s: SupplierRow): string {
  const envName = `${s.key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
  // A key explicitly saved for this supplier is the admin's newest choice.
  // Fall back to the deployment secret only when no panel key is stored.
  const key = s.api_key?.trim() || process.env[envName]?.trim() || "";
  if (!key) throw new Error(`Missing API key for supplier "${s.key}" (secret ${envName})`);
  return key;
}

function supplierLog(event: string, data: Record<string, unknown>) {
  try {
    console.log(`[supplier-api] ${event} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[supplier-api] ${event}`);
  }
}

async function call(
  s: SupplierRow,
  path: string,
  init: { method?: string; body?: any; headers?: Record<string, string> } = {},
) {
  const canbosoCall = isCanboso(s);
  const vexoranCall = isActionDialect(s);
  const legacyBase = (s.base_url || "https://api.qamify.site").replace(/\/$/, "");
  const bases: string[] = canbosoCall
    ? ["https://canboso.com"]
    : vexoranCall && !isMailReader(s)
      // Respect the endpoint saved for this supplier first. Some Vexoran
      // reseller keys are scoped to a dedicated deployment and return 401
      // when sent to the generic host.
      ? Array.from(new Set([legacyBase, "https://api.vexoran.app"]))
      : [legacyBase];

  const key = apiKeyFor(s);
  // Canboso's public buyer API authenticates with a `key` query/body param only.
  const auth: Record<string, string> = canbosoCall ? {} : { Authorization: `Bearer ${key}` };
  if (canbosoCall && init.body) init = { ...init, body: { key, ...init.body } };

  // Vexoran runs on a Supabase edge function; different reseller deployments
  // read the key from a different header (or a query param). Try each style
  // and keep the first one that is not rejected with 401/403.
  const authVariants: Array<{ headers: Record<string, string>; query?: string }> = vexoranCall
    ? [
        { headers: { Authorization: `Bearer ${key}`, apikey: key } },
        { headers: { "x-api-key": key } },
        { headers: { apikey: key } },
        { headers: {}, query: `api_key=${encodeURIComponent(key)}` },
      ]
    : [{ headers: auth }];

  // Canboso rate-limits by server IP. Retrying the same request extends its
  // nginx penalty window, so make only one attempt for that supplier.
  const maxAttempts = canbosoCall ? 1 : 3;

  let lastErr: unknown = null;
  for (let b = 0; b < bases.length; b++) {
    const base = bases[b]!;
    const baseUrl = canbosoCall
      ? `${base}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`
      : `${base}${path}`;
    const startedAt = Date.now();
    try {
      let res: Response | null = null;
      let text = "";
      for (let v = 0; v < authVariants.length; v++) {
        const variant = authVariants[v]!;
        const url = variant.query
          ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${variant.query}`
          : baseUrl;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          res = await fetch(url, {
            method: init.method ?? "GET",
            headers: {
              ...variant.headers,
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(init.headers ?? {}),
            },
            ...(init.body ? { body: JSON.stringify(init.body) } : {}),
          });
          text = await res.text();
          if (res.status !== 429) break;
          let retryAfter = Number(res.headers.get("retry-after") ?? 0);
          try {
            const j = JSON.parse(text);
            retryAfter = retryAfter || Number(j?.rateLimit?.retryAfter ?? 0);
          } catch {}
          if (attempt === maxAttempts - 1) break;
          await new Promise((r) =>
            setTimeout(r, Math.min(8000, Math.max(1500, retryAfter * 1000)) + attempt * 1000),
          );
        }
        if (!res || (res.status !== 401 && res.status !== 403)) break;
      }


      if (!res) throw new Error(`Supplier request failed (${path})`);

      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (json == null) {
        const snippet = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
        throw new Error(`HTTP ${res.status} at ${path}${snippet ? ` — ${snippet}` : " — non-JSON response"}`);
      }
      if (!res.ok || json?.ok === false || json?.success === false) {
        const msg =
          json?.error?.message || json?.message || json?.code || `HTTP ${res.status}`;
        const rateLimited = res.status === 429 || json?.code === "RATE_LIMITED";
        const err = new Error(
          rateLimited && canbosoCall
            ? `Canboso blocked the request with their server-IP rate limit. This is not an API endpoint or database error. Ask Canboso support to fix the API server IP limit/whitelist. (${path})`
            : `${msg} (${path})`,
        );
        // Rate-limit means the endpoint exists — don't let callAny fall through to wrong paths.
        if (rateLimited) (err as any).rateLimited = true;
        (err as any).rateLimitedFlag = rateLimited;
        throw err;
      }
      supplierLog("ok", {
        supplier: s.key,
        base,
        path,
        status: res.status,
        ms: Date.now() - startedAt,
        fallback: b > 0,
      });
      return json;
    } catch (e: any) {
      lastErr = e;
      const isLast = b === bases.length - 1;
      supplierLog("fail", {
        supplier: s.key,
        base,
        path,
        ms: Date.now() - startedAt,
        error: String(e?.message ?? e).slice(0, 200),
        willFallback: !isLast && !e?.rateLimited,
      });
      // Rate limits mean the host answered — don't switch hosts for those.
      if (isLast || e?.rateLimited) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Supplier request failed (${path})`);
}


/** Supplier B (Vexoran / MailReader) uses one endpoint with ?action=... instead of REST paths. */
function isActionDialect(s: SupplierRow) {
  return /vexoran/i.test(s.key) || /reseller-api/i.test(s.base_url || "") || isMailReader(s);
}

/** MailReader reseller API: /api/reseller?action=products|balance|order, Bearer key. */
function isMailReader(s: SupplierRow) {
  return /mailreader/i.test(s.key) || /mailreader\.tech/i.test(s.base_url || "") || /\/api\/reseller$/i.test((s.base_url || "").replace(/\/$/, ""));
}

/** Supplier C (Canboso) uses REST paths but its own envelope/field names. */
// Documented public buyer API (https://canboso.com/api/swagger).
const CANBOSO_ME_PATHS = ["/api/v2/telegram-buyer/balance"];
const CANBOSO_PRODUCT_PATHS = ["/api/v2/telegram-buyer/products"];
const CANBOSO_ORDER_PATHS = ["/api/v2/telegram-buyer/purchase"];

function isCanboso(s: SupplierRow) {
  return /canboso/i.test(s.key) || /canboso\.com/i.test(s.base_url || "");
}

function actionPath(action: string, extra = "") {
  return `?action=${action}${extra}`;
}

/** Try a list of candidate REST paths (docs vary per deployment) and use the first that answers. */
async function callAny(
  s: SupplierRow,
  paths: string[],
  init: { method?: string; body?: any; headers?: Record<string, string> } = {},
) {
  let lastErr: unknown = null;
  let first = true;
  for (const p of paths) {
    // Space out candidate-path attempts so strict per-IP limiters don't trip.
    if (!first) await new Promise((r) => setTimeout(r, 2000));
    first = false;
    try {
      return await call(s, p, init);
    } catch (e) {
      lastErr = e;
      if ((e as any)?.rateLimited) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Supplier request failed");
}

export async function supplierPing(s: SupplierRow) {
  if (isActionDialect(s)) {
    // No dedicated ping action: a successful balance read proves the key works.
    const j = await call(s, actionPath("balance"));
    return { ok: true as const, status: String(j?.status ?? "active") };
  }
  if (isCanboso(s)) {
    // No ping route documented: a profile/balance read proves the key works.
    const j = await callAny(s, CANBOSO_ME_PATHS);
    const d = j.data ?? j;
    return { ok: true as const, status: String(d.status ?? "active") };
  }
  const j = await call(s, "/v1/ping");
  return { ok: true as const, status: String(j.status ?? "active") };
}

export async function supplierBalance(s: SupplierRow) {
  const j = isCanboso(s)
    ? await callAny(s, CANBOSO_ME_PATHS)
    : await call(s, isActionDialect(s) ? actionPath("balance") : "/v1/balance");
  const b = j.balance ?? j.reseller?.balance ?? j.data?.balance ?? j.wallet?.balance ?? j.data?.wallet?.balance;
  return {
    balance: Number(typeof b === "object" && b ? (b.amount ?? 0) : (b ?? Number(j.balance_cents ?? 0) / 100)),
    currency: String(
      j.walletCurrency ?? j.currency ?? j.data?.currency ?? (isActionDialect(s) ? "USDT" : "USD"),
    ),
  };
}

export async function supplierProducts(s: SupplierRow): Promise<SupplierProduct[]> {
  const action = isActionDialect(s);
  const j = action
    ? await call(s, actionPath("products"))
    : isCanboso(s)
      ? await callAny(s, CANBOSO_PRODUCT_PATHS)
      : await call(s, "/v1/products");
  const list: any[] = j.products ?? j.data?.products ?? j.data?.items ?? j.data ?? j.items ?? [];

  if (isCanboso(s)) {
    // Buyer API shape: productId / price{amount,currency} / availability{available}
    const walletCurrency = String(j.walletCurrency ?? "USD");
    return list.flatMap((p) => {
      const rawId = p.productId ?? p.product_id ?? p.id ?? p.uuid ?? p.sku ?? p.code;
      if (rawId == null || String(rawId).trim() === "") {
        supplierLog("skip-product-without-id", { supplier: s.key, name: String(p.name ?? "Product") });
        return [];
      }
      const img = typeof p.image === "string" && p.image ? p.image : null;
      const stockValue =
        p.availability?.available ??
        p.availability?.quantity ??
        p.availability?.qty ??
        p.available_stock ??
        p.stock_quantity ??
        p.quantity ??
        p.stock ??
        0;
      return [{
        external_id: String(rawId),
        name: String(p.name ?? "Product"),
        description: p.description ? String(p.description) : null,
        cost_price: Number(p.price?.amount ?? p.price ?? 0),
        stock: Math.max(0, Number(stockValue) || 0),
        currency: String(p.price?.currency ?? walletCurrency),
        min_qty: Number(p.purchaseRequirements?.minQuantity ?? p.min_qty ?? 1),
        raw: {
          ...p,
          image_url: img ? (img.startsWith("http") ? img : `https://canboso.com${img}`) : null,
        },
      }];
    });
  }

  return list
    // Skip items the API cannot fulfil automatically (manual delivery on their side).
    .filter((p) => (action ? p.api_orderable !== false : true))
    .filter((p) => (isCanboso(s) ? p.status !== "inactive" && p.is_active !== false : true))
    .flatMap((p) => {
      // Some action-style APIs expose `available` as the live numeric count,
      // while others expose it as a boolean. Preserve both dialects.
      const availableCount = typeof p.available === "number" ? p.available : undefined;
      const soldOut = (action && typeof p.available === "boolean" && !p.available) || p.in_stock === false;
      // Service products (Vexoran `requires_stock: false`) carry `stock: null`
      // and are always sellable — treating that null as 0 wrongly showed them
      // as sold out on the site and in the bot.
      const unlimited = p.requires_stock === false && p.available !== false;
      const bulkMin = Array.isArray(p.bulk_discounts) && p.bulk_discounts[0]?.min_qty;
      const rawId = p.id ?? p.product_id ?? p.productId ?? p.item_id ?? p.uuid ?? p.external_product_id ?? p.sku ?? p.code;
      if (rawId == null || String(rawId).trim() === "") {
        supplierLog("skip-product-without-id", { supplier: s.key, name: String(p.name ?? p.title ?? "Product") });
        return [];
      }
      return [{
        external_id: String(rawId),
        name: String(p.name ?? p.title ?? p.product_name ?? "Product"),
        description: p.description_text ? String(p.description_text) : p.description ? String(p.description) : null,
        cost_price:
          p.unit_price_cents != null
            ? Number(p.unit_price_cents) / 100
            : Number(p.price ?? p.unit_price ?? p.base_price ?? p.wholesale_price ?? p.reseller_price ?? p.cost ?? p.cost_price ?? 0),
        stock: soldOut
          ? 0
          : unlimited
            ? 9999
            : Math.max(
                0,
                Number(
                  p.stock ??
                    p.available_stock ??
                    p.stock_count ??
                    p.inventory ??
                    p.inventory_count ??
                    p.qty ??
                    availableCount ??
                    p.quantity ??
                    p.stock_quantity ??
                    0,
                ) || 0,
              ),
        currency: String(p.currency ?? p.currency_code ?? (action ? "USDT" : "USD")),
        min_qty: Number(p.min_qty ?? p.minimum_quantity ?? p.min_quantity ?? bulkMin ?? 1),
        raw: p,
      }];
    });

}

const ITEM_LABELS: Record<string, string> = {
  user: "Account",
  account: "Account",
  username: "Username",
  email: "Email",
  login: "Login",
  password: "Password",
  pass: "Password",
  verifyemail: "Recovery email",
  verify_email: "Recovery email",
  recovery: "Recovery email",
  recoveryemail: "Recovery email",
  expirytext: "Expiry",
  expiry: "Expiry",
  expires_at: "Expiry",
  warranty: "Warranty",
  duration: "Duration",
  note: "Note",
  otherinfo: "Other info",
  other_info: "Other info",
  code: "Code",
  key: "Key",
  link: "Link",
  redeemlink: "Redeem link",
  url: "Link",
};

function deliveryLabel(key: string) {
  return ITEM_LABELS[key] ?? ITEM_LABELS[key.toLowerCase()] ?? key.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function deliveryObjectLines(value: Record<string, any>, depth = 0): string[] {
  const lines: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (child == null || child === "") continue;
    const label = deliveryLabel(key);
    if (typeof child === "object") {
      const nested = Array.isArray(child)
        ? child.flatMap((item) => (item && typeof item === "object" ? deliveryObjectLines(item, depth + 1) : [String(item)]))
        : deliveryObjectLines(child as Record<string, any>, depth + 1);
      if (nested.length) lines.push(`${label}:\n${nested.map((line) => `${"  ".repeat(depth + 1)}${line}`).join("\n")}`);
      continue;
    }
    lines.push(`${label}: ${String(child)}`);
  }
  return lines;
}

/** Turn any supplier delivery payload into readable text without losing nested details. */
export function formatDeliveryItem(input: any): string {
  let value = input;
  if (typeof value === "string") {
    const text = value.trim();
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try {
        value = JSON.parse(text);
      } catch {
        return text;
      }
    } else {
      return text;
    }
  }
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(formatDeliveryItem).filter(Boolean).join("\n");
  if (typeof value !== "object") return String(value);

  // Common response wrappers should not appear as technical labels to buyers.
  for (const key of ["content", "credential", "text", "value", "data"]) {
    const child = value[key];
    if (typeof child === "string" && child.trim()) return formatDeliveryItem(child);
    if (child && typeof child === "object") {
      const nested = formatDeliveryItem(child);
      if (nested) return nested;
    }
  }

  const lines = deliveryObjectLines(value);
  if (lines.length === 1) return lines[0]!.replace(/^[^:]+:\s*/, "");
  return lines.join("\n");
}

/**
 * Pick the first non-empty delivery shape without letting an empty `items: []`
 * hide a populated `delivery` field. Supplier APIs variously return one item,
 * an array, or nested arrays; flatten only arrays so credential objects remain
 * intact as one delivered item.
 */
function firstDeliveryItems(...candidates: any[]): any[] {
  for (const candidate of candidates) {
    if (candidate == null || candidate === "") continue;
    const values = Array.isArray(candidate) ? candidate.flat(Infinity) : [candidate];
    const usable = values.filter((value) => value != null && (typeof value !== "string" || value.trim()));
    if (usable.length) return usable;
  }
  return [];
}

/** Place an order at the supplier. Returns delivered item strings. */
export async function supplierOrder(
  s: SupplierRow,
  externalId: string,
  qty: number,
  idempotencyKey: string,
): Promise<{ code: string | null; items: string[] }> {
  const canboso = isCanboso(s);
  // Canboso requires an Idempotency-Key header of 8-128 chars.
  const idemKey = (idempotencyKey || "")
    .replace(/[^A-Za-z0-9._:-]/g, "")
    .slice(0, 128)
    .padEnd(8, "0") || `ord${Date.now()}`;
  const j = canboso
    ? await call(s, "/api/v2/telegram-buyer/purchase", {
        method: "POST",
        headers: { "Idempotency-Key": idemKey },
        // Documented body: { key, product_id, quantity }. Extra fields are rejected.
        body: { product_id: externalId, quantity: qty },
      })
    : await call(s, isActionDialect(s) ? actionPath("order") : "/v1/orders", {
        method: "POST",
        headers: isActionDialect(s) ? {} : { "Idempotency-Key": idemKey },
        body: isActionDialect(s)
          ? { product_id: externalId, quantity: qty, external_order_id: idempotencyKey }
          : { product_id: Number(externalId), qty, idempotency_key: idempotencyKey },
      });
  const action = isActionDialect(s);
  const order = (j.order ?? j.result ?? j.data?.order ?? (typeof j.data === "object" ? j.data : null) ?? j) as any;
  const del = canboso ? (j.delivery ?? {}) : null;
  const rawItems: any[] = canboso
    ? firstDeliveryItems(del.items, del.accounts, del.keys, del.credentials, del.content, del.text)
    : firstDeliveryItems(
        order.items,
        // MailReader uses both of these shapes across API versions.
        order.delivery_items,
        j.delivery_items,
        order.delivery,
        j.delivery,
        order.keys,
        order.credentials,
        order.delivered_items,
        order.delivered,
        order.accounts,
        j.items,
        j.keys,
        // Vexoran returns the delivered payload as a plain string in `data`.
        typeof order.data === "string" ? order.data : null,
        typeof j.data === "string" ? j.data : null,
        order.content,
      );

  const items = rawItems.map(formatDeliveryItem).filter(Boolean);
  const code = order.code ?? order.order_code ?? order.reference ?? order.order_id ?? order.id ?? j.code ?? null;

  // Action-dialect (Vexoran): the POST may only acknowledge the order, so read
  // the delivered payload back from ?action=orders using our external_order_id.
  if (!items.length && action) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 1500 : 3000));
      try {
        const list = await call(s, actionPath("orders"));
        const rows: any[] = list.orders ?? list.data ?? [];
        const mine = rows.find(
          (o) =>
            String(o.external_order_id ?? "") === idempotencyKey ||
            (code && String(o.order_id ?? o.id ?? "") === String(code)),
        );
        const payload = mine?.data ?? mine?.content ?? mine?.delivery ?? mine?.delivery_items ?? mine?.items;
        const found: string[] = Array.isArray(payload)
          ? payload.map(formatDeliveryItem).filter(Boolean)
          : typeof payload === "string" && payload.trim()
            ? [formatDeliveryItem(payload)]
            : [];
        if (found.length) {
          return { code: mine?.order_id ? String(mine.order_id) : code ? String(code) : null, items: found };
        }
        if (mine && ["failed", "cancelled", "refunded"].includes(String(mine.status ?? ""))) break;
      } catch {
        /* keep retrying; a lookup failure must not lose the order reference */
      }
    }
  }

  if (!items.length && code && !action && !canboso) {
    const detail = await call(s, `/v1/orders/${encodeURIComponent(String(code))}`);
    const detailOrder = detail.order ?? detail.result ?? detail.data?.order ?? detail.data ?? detail;
    const detailItems = firstDeliveryItems(
      detailOrder.items,
      detailOrder.delivery_items,
      detailOrder.delivery,
      detailOrder.keys,
      detailOrder.credentials,
      detailOrder.delivered_items,
      detailOrder.delivered,
      detailOrder.accounts,
      detailOrder.content,
      detailOrder.data,
    );
    return {
      code: String(code),
      items: detailItems.map(formatDeliveryItem).filter(Boolean),
    };
  }
  return { code: code ? String(code) : null, items };
}


/** Final customer price from cost + markup rules. */
export function sellPrice(
  cost: number,
  opts: {
    price_override?: number | null;
    markup_percent?: number | null;
    markup_fixed?: number | null;
    supplier_percent?: number | null;
    supplier_fixed?: number | null;
  },
) {
  if (opts.price_override != null && Number(opts.price_override) > 0) {
    return Math.round(Number(opts.price_override) * 100) / 100;
  }
  const pct = Number(opts.markup_percent ?? opts.supplier_percent ?? 0);
  const fixed = Number(opts.markup_fixed ?? opts.supplier_fixed ?? 0);
  return Math.round((Number(cost) * (1 + pct / 100) + fixed) * 100) / 100;
}

/** A free-form label/value row shown verbatim on the product page. */
export type ProductDetailRow = { label: string; value: string };

/** Keys already mapped into dedicated product columns or internal plumbing. */
const SKIP_DETAIL_KEYS = new Set(
  [
    ...DETAIL_KEYS.description,
    ...DETAIL_KEYS.image,
    ...DETAIL_KEYS.delivery,
    ...DETAIL_KEYS.important,
    ...DETAIL_KEYS.guide,
    "id",
    "uuid",
    "product_id",
    "external_id",
    "sku",
    "slug",
    "name",
    "title",
    "product_name",
    "price",
    "cost",
    "cost_price",
    "sell_price",
    "amount",
    "currency",
    "stock",
    "quantity",
    "available",
    "in_stock",
    "min_qty",
    "min_quantity",
    "max_qty",
    "category_id",
    "created_at",
    "updated_at",
    "status",
    "raw",
    // Internal supplier plumbing — never useful to a buyer.
    "warranty_type",
    "api_orderable",
    "price_locked",
    "custom_price",
    "requires_stock",
    "manual_delivery",
    "external_source",
    "discount_source",
    "base_price",
    "offer",
    "campaign",
    "flash_sale",
    "discount_ends_at",
    "ends_at",
    "active",
    "source",
    "bulk_pricing",
    "bulk_pricing_text",
    "bulk_discounts",
    "bulk_discount_text",
    "bulk_discount_style",
    "bulk_discount_active",
    "bulk_discount_percent",
    "unit_price",
    "discount_percent",
    // Reseller-private accounting from the Qamify-style API — never public.
    "unit_price_cents",
    "your_sold_qty",
    "your_sold_spent",
    "your_sold_spent_cents",
    "reseller_price_cents",
    "your_price_cents",
    // Presented through the curated rows below instead of the raw key name.
    "sold_total",
    "units_per_item",
  ].map(keyName),
);


function humanLabel(key: string) {
  return key
    .replace(/[_\-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Every remaining supplier field, kept exactly as the API sent it, so the
 * website can show the supplier's full product information verbatim.
 */
export function extraDetailsFromRaw(raw: any, depth = 0): ProductDetailRow[] {
  if (!raw || typeof raw !== "object" || depth > 3) return [];
  const rows: ProductDetailRow[] = [];
  const seen = new Set<string>();
  const push = (label: string, value: string | null) => {
    if (!value) return;
    const key = `${keyName(label)}|${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ label, value });
  };

  if (depth === 0) {
    // Buyer-facing versions of the numeric fields the supplier bot also shows.
    const num = (key: string) => {
      const value = Number((raw as any)[key]);
      return Number.isFinite(value) ? value : null;
    };
    const sold = num("sold_total");
    if (sold != null && sold > 0) push("Total sold", String(sold));
    const units = num("units_per_item");
    if (units != null && units > 1) push("Units per item", String(units));
    const maxQty = num("max_qty") ?? num("maximum_quantity") ?? num("max_quantity");
    if (maxQty != null && maxQty > 0) push("Max per order", String(maxQty));
    const minQty = num("min_qty") ?? num("minimum_quantity") ?? num("min_quantity");
    if (minQty != null && minQty > 1) push("Min per order", String(minQty));
  }

  for (const [key, value] of Object.entries(raw)) {

    if (SKIP_DETAIL_KEYS.has(keyName(key))) continue;
    if (value == null || value === "") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of extraDetailsFromRaw(value, depth + 1)) push(nested.label, nested.value);
      continue;
    }
    push(humanLabel(key), textValue(value));
  }
  return rows.slice(0, 40);
}
