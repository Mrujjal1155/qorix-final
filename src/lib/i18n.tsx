import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TRANSLATIONS, type LocaleCode } from "@/lib/i18n-dictionaries";

export type { LocaleCode };

export type LocaleOption = {
  code: LocaleCode;
  /** Name shown in the switcher, written in the language itself. */
  label: string;
  /** Country/region hint. */
  region: string;
  /** ISO country code used to pick the flag icon. */
  flag: string;
  dir: "ltr" | "rtl";
  /** Browser language prefixes that map to this locale. */
  match: string[];
};

export const LOCALES: LocaleOption[] = [
  { code: "en", label: "English", region: "International", flag: "US", dir: "ltr", match: ["en"] },
  { code: "pt-BR", label: "Português", region: "Brasil", flag: "BR", dir: "ltr", match: ["pt"] },
  { code: "es", label: "Español", region: "España / LatAm", flag: "ES", dir: "ltr", match: ["es"] },
  { code: "hi", label: "हिन्दी", region: "India", flag: "IN", dir: "ltr", match: ["hi"] },
  { code: "ur", label: "اردو", region: "Pakistan", flag: "PK", dir: "rtl", match: ["ur"] },
  { code: "bn", label: "বাংলা", region: "Bangladesh", flag: "BD", dir: "ltr", match: ["bn"] },
  { code: "en-NG", label: "English", region: "Nigeria", flag: "NG", dir: "ltr", match: ["ha", "yo", "ig"] },
  { code: "ar", label: "العربية", region: "السعودية", flag: "SA", dir: "rtl", match: ["ar"] },
];

const STORAGE_KEY = "pref_locale";

export function localeOption(code: string): LocaleOption {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0]!;
}

function detectLocale(): LocaleCode {
  if (typeof navigator === "undefined") return "en";
  const langs = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean) as string[];
  for (const raw of langs) {
    const lower = raw.toLowerCase();
    const exact = LOCALES.find((l) => l.code.toLowerCase() === lower);
    if (exact) return exact.code;
    const base = lower.split("-")[0]!;
    const hit = LOCALES.find((l) => l.match.includes(base));
    if (hit) return hit.code;
  }
  return "en";
}

export function translate(locale: LocaleCode, text: string): string {
  if (locale === "en" || locale === "en-NG") return text;
  const entry = TRANSLATIONS[text];
  return (entry && entry[locale]) || text;
}

type I18nValue = {
  locale: LocaleCode;
  option: LocaleOption;
  setLocale: (code: LocaleCode) => void;
  t: (text: string, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>("en");

  /* restore saved choice (or detect the visitor's language) after hydration */
  useEffect(() => {
    let next: LocaleCode | null = null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LOCALES.some((l) => l.code === saved)) next = saved as LocaleCode;
    } catch {
      /* ignore */
    }
    setLocaleState(next ?? detectLocale());
  }, []);

  /* keep <html lang/dir> in sync so RTL languages render correctly */
  useEffect(() => {
    const opt = localeOption(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = opt.dir;
  }, [locale]);

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (text: string, vars?: Record<string, string | number>) => {
      let out = translate(locale, text);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
      }
      return out;
    },
    [locale],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, option: localeOption(locale), setLocale, t }),
    [locale, setLocale, t],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  return (
    useContext(Ctx) ?? {
      locale: "en",
      option: LOCALES[0]!,
      setLocale: () => {},
      t: (text: string) => text,
    }
  );
}

/** Convenience hook: `const t = useT(); t("Home")` */
export function useT() {
  return useI18n().t;
}
