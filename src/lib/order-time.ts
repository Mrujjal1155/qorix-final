export const DEFAULT_ORDER_TIMEZONE = "Asia/Dhaka";

export function orderTimezone(value?: string | null) {
  const zone = value?.trim() || DEFAULT_ORDER_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_ORDER_TIMEZONE;
  }
}