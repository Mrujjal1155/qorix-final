import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ADMIN_THEME_STORAGE_KEY, resolveAdminTheme, type AdminTheme } from "@/lib/admin-theme";

const AdminThemeContext = createContext<{
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
}>({ theme: "darkpan", setTheme: () => {} });

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<AdminTheme>("darkpan");

  useEffect(() => {
    try {
      updateTheme(resolveAdminTheme(localStorage.getItem(ADMIN_THEME_STORAGE_KEY)));
    } catch {
      // Storage may be disabled; the selector still works for this visit.
    }
    function sync(event: StorageEvent) {
      if (event.key === ADMIN_THEME_STORAGE_KEY || event.key === null) {
        updateTheme(resolveAdminTheme(event.newValue));
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function setTheme(next: AdminTheme) {
    updateTheme(next);
    try {
      localStorage.setItem(ADMIN_THEME_STORAGE_KEY, next);
    } catch {
      // Never block management controls when browser storage is unavailable.
    }
  }

  return <AdminThemeContext.Provider value={{ theme, setTheme }}>{children}</AdminThemeContext.Provider>;
}

export function useAdminTheme() {
  return useContext(AdminThemeContext);
}