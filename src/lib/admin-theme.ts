export type AdminTheme = "darkpan" | "legacy";
export const ADMIN_THEME_STORAGE_KEY = "qorix-admin-theme";

export function resolveAdminTheme(value: string | null): AdminTheme {
  return value === "legacy" ? "legacy" : "darkpan";
}