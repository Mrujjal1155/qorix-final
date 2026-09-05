import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Headphones, ShieldCheck, Zap, type LucideIcon } from "lucide-react";

type Feature = { key: string; icon: LucideIcon; label: string; detail: string };

const FEATURES: Feature[] = [
  {
    key: "delivery",
    icon: Zap,
    label: "Instant Delivery",
    detail: "As soon as your order is confirmed, the account / key is delivered automatically — no waiting.",
  },
  {
    key: "pay",
    icon: ShieldCheck,
    label: "Secure Crypto Pay",
    detail: "Binance Pay and USDT (BEP20 / TRC20) — every payment is verified automatically.",
  },
  {
    key: "support",
    icon: Headphones,
    label: "24/7 Support",
    detail: "Our support team is on Telegram 24 hours a day for any issue.",
  },
];

export function FeatureButtons() {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);

  function activate(key: string) {
    setOpen((cur) => (cur === key ? null : key));
    setPulse(key);
    window.setTimeout(() => setPulse((p) => (p === key ? null : p)), 700);
  }

  return (
    <div className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
      {FEATURES.map(({ key, icon: Icon, label: rawLabel, detail: rawDetail }) => {
        const label = t(rawLabel);
        const detail = t(rawDetail);
        const isOpen = open === key;
        const isPulse = pulse === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => activate(key)}
            aria-expanded={isOpen}
            className={`glass-panel group relative isolate overflow-hidden rounded-2xl px-3 py-4 text-center transition-all duration-300 hover:-translate-y-1 ${
              isOpen ? "border-primary/60 shadow-lg shadow-primary/20" : ""
            } ${isPulse ? "feature-pop" : ""}`}
          >
            {isPulse && (
              <span
                aria-hidden
                className="feature-ripple pointer-events-none absolute left-1/2 top-1/2 -z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/40"
              />
            )}
            <Icon
              className={`mx-auto h-5 w-5 text-primary transition-colors ${isPulse ? "feature-icon-active" : ""}`}
            />
            <p className="mt-2 text-xs font-medium sm:text-sm">{label}</p>
            {isOpen && <p className="feature-reveal mt-2 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>}
            <span
              aria-hidden
              className={`mx-auto mt-2 block h-0.5 rounded-full bg-primary transition-all duration-300 ${
                isOpen ? "w-10" : "w-0 group-hover:w-6"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
