export type AdminTheme = "darkpan" | "legacy" | "light";
export const ADMIN_THEME_STORAGE_KEY = "qorix-admin-theme";

export function resolveAdminTheme(value: string | null): AdminTheme {
  return value === "legacy" || value === "light" ? value : "darkpan";
}

export function adminThemeClass(theme: AdminTheme): string {
  if (theme === "light") return "admin-theme admin-light";
  return `dark admin-theme ${theme === "darkpan" ? "darkpan" : "admin-legacy"}`;
}
