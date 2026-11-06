import { Link } from "@tanstack/react-router";
import { Bell, Eye, ShieldCheck, ShoppingCart } from "lucide-react";
import { SmartImage } from "@/components/SmartImage";
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
  slug?: string | null;
  in_stock?: boolean;
};

export function discountPct(p: StoreProduct) {
  const old = Number(p.old_price ?? 0);
  if (!old || old <= Number(p.price)) return 0;
  return Math.round(((old - Number(p.price)) / old) * 100);
}

export function ProductCard({
  product,
  priority = false,
  variantNote,
}: {
  product: StoreProduct;
  priority?: boolean;
  /** Shown when another listing has the same name, so buyers can tell them apart. */
  variantNote?: string | undefined;
}) {
  const t = useT();
  const off = discountPct(product);
  const { money, usd, currency } = usePrefs();
  const auto = product.delivery_type === "auto";
  const sold = Number(product.sold ?? 0);
  const deliveryText = product.delivery_time ? t(product.delivery_time) : auto ? t("Instant delivery") : t("Manual delivery");
  const noWarranty = /no\s*warranty/i.test(product.delivery_time ?? "");
  const badgeNoWarranty = /no\s*warranty/i.test(product.badge ?? "");
  // Only an explicit "not in stock" disables buying; unknown keeps the old behaviour.
  const soldOut = product.in_stock === false;

  return (
    <article className="group relative flex flex-col">
      <Link
        to="/store/$id"
        params={{ id: (product as any).slug ?? product.id }}
        search={{ buy: false }}
        className="relative block aspect-[4/3] overflow-hidden rounded-lg border border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-secondary/40 transition-colors group-hover:border-primary/50"
      >
        <SmartImage
          src={product.image_url}
          alt={product.name}
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 320px"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />

        {/* top badge row */}
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          {off > 0 ? (
            <span className="rounded-sm bg-destructive px-2 py-0.5 font-mono text-[11px] font-medium text-destructive-foreground">
              -{off}%
            </span>
          ) : (
            <span />
          )}
          {product.badge ? (
            <span
              className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider backdrop-blur ${
                badgeNoWarranty
                  ? "border-warning/60 bg-warning/20 text-warning"
                  : "border-border/70 bg-background/80 text-foreground"
              }`}
            >
              {product.badge}
            </span>
          ) : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 pt-4">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight">{product.name}</h3>
        {variantNote ? (
          <p className="border-l-2 border-primary pl-2 font-mono text-[11px] text-primary">
            {variantNote}
          </p>
        ) : null}

        {/* No star row: there are no real reviews to average. */}
        {sold > 0 && <p className="text-xs text-success">↗ {sold}+ {t("sold")}</p>}

        <p
          className={`inline-flex items-center gap-1.5 text-xs ${
            noWarranty ? "text-warning" : "text-success"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
          {deliveryText}
        </p>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] pt-3">
          <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{money(product.price)}</span>
          {product.old_price ? (
            <span className="text-sm text-muted-foreground line-through">{money(product.old_price)}</span>
          ) : null}
          {currency !== "USD" ? (
            <span className="w-full text-[11px] text-muted-foreground">≈ {usd(product.price)} USD</span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button asChild size="sm" variant="ghost" className="flex-1 rounded-md border border-[color-mix(in_oklab,var(--foreground)_12%,transparent)]">
            <Link to="/store/$id" params={{ id: (product as any).slug ?? product.id }} search={{ buy: false }}>
              <Eye className="h-4 w-4" strokeWidth={1.75} /> {t("View Details")}
            </Link>
          </Button>
          {soldOut ? (
            <Button asChild size="sm" variant="outline" className="h-auto min-h-8 flex-1 whitespace-normal rounded-md py-1 text-xs">
              <a href={`https://t.me/QORIX3_bot?start=p_${product.id}`} target="_blank" rel="noreferrer">
                <Bell className="h-4 w-4" strokeWidth={1.75} /> {t("Notify me when back in stock")}
              </a>
            </Button>
          ) : (
            <Button asChild size="sm" className="flex-1 rounded-md">
              <Link to="/store/$id" params={{ id: (product as any).slug ?? product.id }} search={{ buy: true }}>
                <ShoppingCart className="h-4 w-4" strokeWidth={1.75} /> {t("Buy Now")}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
