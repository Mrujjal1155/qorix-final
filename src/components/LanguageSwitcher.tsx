import { Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountryFlag } from "@/components/CountryFlag";
import { LOCALES, useI18n } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, option, setLocale, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("Change language")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:border-primary/50",
            className,
          )}
        >
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          <CountryFlag country={option.flag} className="h-3.5 w-5 shrink-0 rounded-[3px]" />
          <span className="uppercase">{option.code.split("-")[0]}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => setLocale(l.code)}
            className="flex items-center gap-2.5"
          >
            <CountryFlag country={l.flag} className="h-4 w-[22px] shrink-0 rounded-[3px] shadow-sm" />
            <span className="flex-1 leading-tight">
              <span className="block text-sm font-medium">{l.label}</span>
              <span className="block text-[11px] text-muted-foreground">{l.region}</span>
            </span>
            {locale === l.code ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
