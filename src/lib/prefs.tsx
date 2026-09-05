import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n, type LocaleCode } from "@/lib/i18n";
import { listCurrencyRates } from "@/lib/currency.functions";

export type Lang = "en";
export type Currency = "USD" | "BRL" | "EUR" | "INR" | "PKR" | "BDT" | "NGN" | "SAR";

/** Currency shown by default for each site language. */
export const LOCALE_CURRENCY: Record<LocaleCode, Currency> = {
  en: "USD",
  "pt-BR": "BRL",
  es: "EUR",
  hi: "INR",
  ur: "PKR",
  bn: "BDT",
  "en-NG": "NGN",
  ar: "SAR",
};

export const CURRENCIES: Currency[] = ["USD", "BRL", "EUR", "INR", "PKR", "BDT", "NGN", "SAR"];

const LOCALE_TAG: Record<Currency, string> = {
  USD: "en-US",
  BRL: "pt-BR",
  EUR: "de-DE",
  INR: "en-IN",
  PKR: "en-PK",
  BDT: "bn-BD",
  NGN: "en-NG",
  SAR: "ar-SA",
};

/** Offline fallback used until the live rates arrive. */
const FALLBACK_RATES: Record<Currency, number> = {
  USD: 1,
  BRL: 5.4,
  EUR: 0.92,
  INR: 83,
  PKR: 278,
  BDT: 120,
  NGN: 1500,
  SAR: 3.75,
};

const RATES_KEY = "pref_rates_v1";
const RATES_TTL = 6 * 60 * 60 * 1000; // 6 hours
const CURRENCY_KEY = "pref_currency";

type Rates = Record<string, number>;

function readCachedRates(): Rates | null {
  try {
    const raw = localStorage.getItem(RATES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; rates: Rates };
    if (!parsed?.rates || Date.now() - parsed.at > RATES_TTL) return null;
    return parsed.rates;
  } catch {
    return null;
  }
}

async function fetchLiveRates(): Promise<Rates | null> {
  // Free, keyless USD-based rate APIs (tried in order).
  const primary = "https://open.er-api.com/v6/latest/USD";
  const fallback = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
  try {
    const res = await fetch(primary, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const json = await res.json();
      if (json?.rates && typeof json.rates === "object") return json.rates as Rates;
    }
  } catch {
    /* try next */
  }
  try {
    const res = await fetch(fallback, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const json = await res.json();
      const usd = json?.usd;
      if (usd && typeof usd === "object") {
        const rates: Rates = {};
        for (const [k, v] of Object.entries(usd)) rates[k.toUpperCase()] = Number(v);
        return rates;
      }
    }
  } catch {
    /* give up */
  }
  return null;
}

async function fetchTableRates(): Promise<{ rates: Rates; locales: Record<string, string> } | null> {
  // Admin-managed conversion table wins where set; gaps are filled by the free live API.
  const live = await fetchLiveRates();
  const rates: Rates = { ...(live ?? {}) };
  const locales: Record<string, string> = {};
  try {
    const rows = await listCurrencyRates();
    for (const r of rows ?? []) {
      if (!r.is_active) continue;
      if (Number(r.rate) > 0) rates[r.code] = Number(r.rate); // admin rate overrides live
      if (r.locale_tag) locales[r.code] = r.locale_tag;
    }
  } catch {
    /* keep live rates only */
  }
  return Object.keys(rates).length ? { rates, locales } : null;
}


type Prefs = {
  lang: Lang;
  currency: Currency;
  /** true when the currency follows the selected site language. */
  auto: boolean;
  rate: number;
  ratesLive: boolean;
  setLang: (l: Lang) => void;
  setCurrency: (c: Currency | "auto") => void;
  /** Amount (USD in DB) formatted in the active currency. */
  money: (n: unknown) => string;
  /** The same amount always formatted in USD. */
  usd: (n: unknown) => string;
};

const Ctx = createContext<Prefs | null>(null);

function format(value: number, currency: Currency, localeTag?: string) {
  try {
    return new Intl.NumberFormat(localeTag || LOCALE_TAG[currency], {
      style: "currency",
      currency,
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const [lang] = useState<Lang>("en");
  const [override, setOverride] = useState<Currency | null>(null);
  const [rates, setRates] = useState<Rates>(FALLBACK_RATES);
  const [ratesLive, setRatesLive] = useState(false);
  const [locales, setLocales] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = localStorage.getItem(CURRENCY_KEY);
    if (saved && (CURRENCIES as string[]).includes(saved)) setOverride(saved as Currency);

    const cached = readCachedRates();
    if (cached) {
      setRates(cached);
      setRatesLive(true);
    }
    let alive = true;
    void fetchTableRates().then((res) => {
      if (!alive || !res) return;
      setRates(res.rates);
      setLocales(res.locales);
      setRatesLive(true);
      try {
        localStorage.setItem(RATES_KEY, JSON.stringify({ at: Date.now(), rates: res.rates }));
      } catch {
        /* ignore */
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const currency: Currency = override ?? LOCALE_CURRENCY[locale] ?? "USD";
  const rate = Number(rates[currency]) > 0 ? Number(rates[currency]) : FALLBACK_RATES[currency];

  const value = useMemo<Prefs>(
    () => ({
      lang,
      currency,
      auto: override === null,
      rate,
      ratesLive,
      setLang: () => {},
      setCurrency: (c) => {
        if (c === "auto") {
          setOverride(null);
          localStorage.removeItem(CURRENCY_KEY);
          return;
        }
        setOverride(c);
        localStorage.setItem(CURRENCY_KEY, c);
      },
      money: (n) => format(Number(n ?? 0) * rate, currency, locales[currency]),
      usd: (n) => format(Number(n ?? 0), "USD"),
    }),
    [lang, currency, override, rate, ratesLive, locales],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  return (
    useContext(Ctx) ?? {
      lang: "en",
      currency: "USD",
      auto: true,
      rate: 1,
      ratesLive: false,
      setLang: () => {},
      setCurrency: () => {},
      money: (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`,
      usd: (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`,
    }
  );
}

const DICT: Record<string, string> = {
  home: "Home",
  about: "About",
  products: "Products",
  faq: "FAQ",
  contact: "Contact Us",
};

export function useT() {
  return (key: string) => DICT[key] ?? key;
}
