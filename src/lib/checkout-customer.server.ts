import { checkoutCustomer } from "@/lib/checkout-customer";

export async function connectedCheckoutCustomer(userId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: profile, error } = await db.from("profiles").select("telegram_id").eq("id", userId).maybeSingle();
  const telegramId = Number(profile?.telegram_id ?? 0);
  if (error || !telegramId) throw new Error("Connect your Telegram account first.");
  const { data: user, error: userError } = await db.from("bot_users").select("first_name,is_banned").eq("telegram_id", telegramId).maybeSingle();
  if (userError || !user) throw new Error("Telegram account unavailable");
  return checkoutCustomer({ userId, telegramId, name: user.first_name, banned: user.is_banned }, { customer_name: "", customer_email: "" });
}