import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Headphones, ShieldCheck, Zap, type LucideIcon } from "lucide-react";

type Feature = { key: string; icon: LucideIcon; label: string; detail: string };

const FEATURES: Feature[] = [
  {
    key: "delivery",
    icon: Zap,
    label: "Instant Delivery",
    detail: "Credentials in your inbox within seconds of payment",
  },
  {
    key: "pay",
    icon: ShieldCheck,
    label: "Secure Crypto Pay",
    detail: "Binance Pay, USDT, bKash & Nagad — no card needed",
  },
  {
    key: "support",
    icon: Headphones,
    label: "Telegram Support",
    detail: "Help through @QORIX3_bot",
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
    <div className="mt-12 grid border-y hairline sm:grid-cols-3 sm:divide-x sm:divide-[var(--hairline)] lg:mt-16">
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
            className={`group relative isolate flex items-start gap-4 overflow-hidden border-b hairline px-1 py-5 text-left transition-colors last:border-b-0 sm:border-b-0 sm:px-6 sm:first:pl-0 ${
              isOpen ? "text-foreground" : ""
            } ${isPulse ? "feature-pop" : ""}`}
          >
            {isPulse && (
              <span
                aria-hidden
                className="feature-ripple pointer-events-none absolute left-1/2 top-1/2 -z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/40"
              />
            )}
            <Icon
              strokeWidth={1.75}
              className={`mt-0.5 h-5 w-5 shrink-0 text-primary transition-colors ${isPulse ? "feature-icon-active" : ""}`}
            />
            <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{detail}</span>
            <span
              aria-hidden
              className={`mt-2 block h-px bg-primary transition-all duration-300 ${
                isOpen ? "w-10" : "w-0 group-hover:w-6"
              }`}
            />
            </span>
          </button>
        );
      })}
    </div>
  );
}
