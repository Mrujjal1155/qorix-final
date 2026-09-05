import { Link } from "@tanstack/react-router";
import { Eye, ShieldCheck, ShoppingCart, Star, Zap } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/lib/prefs";
import { useT } from "@/lib/i18n";

export type StoreProduct = {
  id: string;
  name: string;
  emoji?: string | null;
  description?: string | null;
  price: number;
  old_price?: number | null;
  image_url?: string | null;
  delivery_time?: string | null;
  badge?: string | null;
  delivery_type: string;
  stock?: number;
  sold?: number;
};

export function discountPct(p: StoreProduct) {
  const old = Number(p.old_price ?? 0);
  if (!old || old <= Number(p.price)) return 0;
  return Math.round(((old - Number(p.price)) / old) * 100);
}

export function ProductCard({ product }: { product: StoreProduct }) {
  const t = useT();
  const off = discountPct(product);
  const { money, usd, currency } = usePrefs();
  const auto = product.delivery_type === "auto";
  const sold = Number(product.sold ?? 0);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/60 hover:card-glow">
      <Link
        to="/store/$id"
        params={{ id: product.id }}
        search={{ buy: false }}
        className="relative block aspect-[4/3] overflow-hidden bg-secondary/60"
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-chart-4/15 text-primary">
            <CategoryIcon name={product.name} className="h-16 w-16" />
          </span>
        )}

        {/* top badge row */}
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          {off > 0 ? (
            <span className="rounded-full bg-destructive px-2.5 py-1 text-[11px] font-bold text-destructive-foreground shadow">
              -{off}%
            </span>
          ) : (
            <span />
          )}
          {product.badge ? (
            <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground backdrop-blur">
              {product.badge}
            </span>
          ) : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug">{product.name}</h3>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />
          ))}
          {sold > 0 && <span className="ml-1.5 text-success">↗ {sold}+ {t("sold")}</span>}
        </div>

        <p className="inline-flex items-center gap-1.5 text-xs text-success">
          <ShieldCheck className="h-3.5 w-3.5" />
          {product.delivery_time ? t(product.delivery_time) : auto ? t("Instant delivery") : t("Manual delivery")}
        </p>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xl font-extrabold text-primary">{money(product.price)}</span>
          {product.old_price ? (
            <span className="text-sm text-muted-foreground line-through">{money(product.old_price)}</span>
          ) : null}
          {currency !== "USD" ? (
            <span className="w-full text-[11px] text-muted-foreground">≈ {usd(product.price)} USD</span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center gap-2">
          <Button asChild size="sm" variant="secondary" className="flex-1 rounded-lg">
            <Link to="/store/$id" params={{ id: product.id }} search={{ buy: false }}>
              <Eye className="h-4 w-4" /> {t("View Details")}
            </Link>
          </Button>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${
              auto ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
            }`}
          >
            <Zap className="h-3 w-3" /> {auto ? t("Instant") : t("Manual")}
          </span>
          <Button asChild size="sm" className="flex-1 rounded-lg">
            <Link to="/store/$id" params={{ id: product.id }} search={{ buy: true }}>
              <ShoppingCart className="h-4 w-4" /> {t("Buy Now")}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
