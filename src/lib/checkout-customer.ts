export function checkoutCustomer(identity: { userId: string; telegramId: number; name?: string | null; banned?: boolean } | null, guest: { customer_name: string; customer_email: string }) {
  if (identity) {
    if (!identity.userId || !Number.isSafeInteger(identity.telegramId) || identity.telegramId <= 0 || identity.banned) throw new Error("Telegram account unavailable");
    return { customer_name: identity.name?.trim() || `Telegram ${identity.telegramId}`, customer_email: `tg${identity.telegramId}@telegram.qorixlab.com`, telegram_id: identity.telegramId, user_id: identity.userId };
  }
  const name = guest.customer_name.trim().slice(0, 80);
  const email = guest.customer_email.trim().slice(0, 200);
  if (name.length < 2) throw new Error("Name is required");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Valid email is required");
  return { customer_name: name, customer_email: email, telegram_id: 0, user_id: null };
}