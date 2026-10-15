import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Email every active reseller that has an email address on file. Admin-only.
 * Sends are sequential with a small pause so Resend rate limits are not hit;
 * failures are collected and reported, never thrown mid-loop.
 */
export const notifyAllResellers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subject: string; message: string; imageUrl?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const subject = (data.subject ?? "").trim();
    const message = (data.message ?? "").trim();
    if (!subject || !message) throw new Error("Subject and message are required");
    const imageUrl = (data.imageUrl ?? "").trim();
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new Error("Image must be an https:// URL");

    const sb = (context as any).supabase;
    const { data: rows, error } = await sb
      .from("resellers")
      .select("id,name,email,is_active")
      .eq("is_active", true)
      .not("email", "is", null);
    if (error) throw new Error(error.message);
    const targets = (rows ?? []).filter((r: any) => String(r.email ?? "").includes("@"));
    if (!targets.length) throw new Error("No active reseller has an email address");

    const { sendResendEmail, getEmailBrand, siteBaseUrl } = await import("@/lib/email/resend.server");
    const { resellerBroadcastEmail } = await import("@/lib/email/templates");
    const brand = await getEmailBrand();
    const base = siteBaseUrl();

    let sent = 0;
    const failed: { name: string; error: string }[] = [];
    for (const r of targets) {
      const tpl = resellerBroadcastEmail({
        siteName: brand.siteName,
        logoUrl: brand.logoUrl,
        name: String(r.name ?? ""),
        subject,
        message,
        imageUrl: imageUrl || undefined,
        docsUrl: `${base}/reseller/docs`,
        panelUrl: `${base}/reseller/panel`,
      });
      const res = await sendResendEmail({
        to: String(r.email),
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        kind: "reseller",
        tags: [{ name: "type", value: "reseller_broadcast" }],
      });
      if (res.ok) sent += 1;
      else failed.push({ name: String(r.name ?? r.email), error: res.error ?? "unknown" });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return { total: targets.length, sent, failed };
  });

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

function newKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "qxr_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const listResellers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const [{ data: rows }, { data: orders }] = await Promise.all([
      sb.from("resellers").select("*").order("created_at", { ascending: false }),
      sb.from("orders").select("reseller_id,total,status").not("reseller_id", "is", null),
    ]);
    const stats: Record<string, { orders: number; spent: number }> = {};
    for (const o of orders ?? []) {
      const k = String(o.reseller_id);
      stats[k] ??= { orders: 0, spent: 0 };
      stats[k].orders += 1;
      stats[k].spent += Number(o.total ?? 0);
    }
    return (rows ?? []).map((r: any) => ({ ...r, stats: stats[r.id] ?? { orders: 0, spent: 0 } }));
  });

export const createReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; email?: string; discount_percent?: number; notes?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const name = String(data.name ?? "").trim();
    if (name.length < 2) throw new Error("Reseller name is required");
    const { data: row, error } = await (context as any).supabase
      .from("resellers")
      .insert({
        name,
        email: data.email?.trim() || null,
        discount_percent: Math.max(0, Math.min(90, Number(data.discount_percent ?? 0))),
        notes: data.notes ?? null,
        api_key: newKey(),
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      name?: string;
      email?: string | null;
      discount_percent?: number;
      is_active?: boolean;
      allow_website?: boolean;
      allow_bot?: boolean;
      notes?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = {};
    if (rest.name !== undefined) patch["name"] = String(rest.name).trim();
    if (rest.email !== undefined) patch["email"] = rest.email || null;
    if (rest.discount_percent !== undefined)
      patch["discount_percent"] = Math.max(0, Math.min(90, Number(rest.discount_percent) || 0));
    if (rest.is_active !== undefined) patch["is_active"] = Boolean(rest.is_active);
    if (rest.allow_website !== undefined) patch["allow_website"] = Boolean(rest.allow_website);
    if (rest.allow_bot !== undefined) patch["allow_bot"] = Boolean(rest.allow_bot);
    if (rest.notes !== undefined) patch["notes"] = rest.notes;
    const { error } = await (context as any).supabase.from("resellers").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateResellerKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const key = newKey();
    const { error } = await (context as any).supabase.from("resellers").update({ api_key: key }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { api_key: key };
  });

export const deleteReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase.from("resellers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Add (positive) or take back (negative) reseller balance, with a ledger entry. */
export const adjustResellerBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; amount: number; note?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const amount = Math.round(Number(data.amount) * 100) / 100;
    if (!amount) throw new Error("Amount must not be zero");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: balance, error } = await (supabaseAdmin as any).rpc("reseller_adjust_balance", {
      _reseller_id: data.id,
      _amount: amount,
      _type: amount > 0 ? "credit" : "debit",
      _reference: "admin",
      _note: data.note ?? (amount > 0 ? "Admin top-up" : "Admin deduction"),
    });
    if (error) throw new Error(error.message);
    return { balance: Number(balance) };
  });

export const getResellerDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const [{ data: reseller }, { data: transactions }, { data: orders }] = await Promise.all([
      sb.from("resellers").select("*").eq("id", data.id).maybeSingle(),
      sb
        .from("reseller_transactions")
        .select("*")
        .eq("reseller_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
      sb
        .from("orders")
        .select("id,order_no,product_name,quantity,total,status,source,external_ref,created_at")
        .eq("reseller_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return { reseller, transactions: transactions ?? [], orders: orders ?? [] };
  });

/** Admin-only: one-time sign-in link into a reseller's own account (for checking their panel). */
export const resellerLoginLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; origin: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: r } = await db.from("resellers").select("id,name,user_id,email").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Reseller not found");
    let email = "";
    if (r.user_id) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(String(r.user_id));
      email = String(u?.user?.email ?? "");
    }
    if (!email) throw new Error("This reseller has no website login yet");
    const origin = /^https?:\/\/[^/]+$/.test(String(data.origin)) ? String(data.origin) : "";
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: origin ? `${origin}/reseller/panel` : "https://qorixlab.com/reseller/panel" },
    });
    if (error || !link?.properties?.action_link) throw new Error(error?.message || "Could not create login link");
    console.log(`[admin] login-as-reseller ${r.id} by ${(context as any).userId}`);
    return { url: link.properties.action_link, email, name: r.name };
  });
