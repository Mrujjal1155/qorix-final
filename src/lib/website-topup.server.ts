export type WebsiteTopupIdentity = {
  user_id: string;
  telegram_id: 0;
  customer_name: string;
  customer_email: string;
};

/** Hosted wallet top-ups belong only to an unlinked, active email account. */
export async function websiteTopupIdentity(userId: string): Promise<WebsiteTopupIdentity> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("telegram_id,email,full_name,is_banned")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile || profile.is_banned) throw new Error("This account cannot add funds.");
  if (profile.telegram_id) throw new Error("Your Telegram wallet is connected — use the Deposit page for the bot wallet.");
  const email = String(profile.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Your account has no valid email.");

  const { count } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("source", "website")
    .eq("status", "pending")
    .eq("user_id", userId);
  if ((count ?? 0) >= 5) throw new Error("You already have several payments awaiting confirmation. Please wait until they are reviewed.");

  return {
    user_id: userId,
    telegram_id: 0,
    customer_name: String(profile.full_name || "Customer").trim().slice(0, 80) || "Customer",
    customer_email: email,
  };
}

export function hostedTopupAmount(value: number) {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!(amount >= 1 && amount <= 10000)) throw new Error("Enter an amount between 1 and 10000.");
  return amount;
}

export async function createWebsiteTopupOrder(
  identity: WebsiteTopupIdentity,
  input: { amount: number; payment_method: "eps" | "oxapay"; txid?: string; meta: Record<string, unknown> },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      telegram_id: 0,
      user_id: identity.user_id,
      source: "website",
      product_id: null,
      product_name: "Wallet top-up",
      quantity: 1,
      unit_price: input.amount,
      total: input.amount,
      status: "pending",
      delivery_type: "auto",
      customer_name: identity.customer_name,
      customer_email: identity.customer_email,
      payment_method: input.payment_method,
      ...(input.txid ? { txid: input.txid } : {}),
      meta: { ...input.meta, wallet_topup: true } as any,
    })
    .select("id,order_no")
    .maybeSingle();
  if (error || !order) {
    if (error?.message?.includes("txid")) throw new Error("This transaction ID has already been used");
    throw new Error("Could not save the payment. Please try again.");
  }
  return { id: String(order.id), order_no: Number(order.order_no) };
}
