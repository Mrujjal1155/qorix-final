import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import bundledLogo from "@/assets/qorix-shop-logo-new.png";

const LOGO_CACHE_KEY = "qorix_brand_logo_url";

/**
 * Renders the current site logo. The last known logo URL is cached in
 * localStorage, so while fresh content loads we instantly show the real
 * current logo. Before any logo has loaded (or if none is configured) we
 * show the bundled QORIX STORE logo — never a placeholder or blank flash.
 */
export function BrandLogo({
  src,
  name,
  className,
  textClassName,
}: {
  src?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
  textClassName?: string | undefined;
}) {
  const [cached, setCached] = useState<string | null>(null);

  useEffect(() => {
    if (src) {
      try {
        localStorage.setItem(LOGO_CACHE_KEY, src);
      } catch {
        /* ignore */
      }
      setCached(null);
      return;
    }
    try {
      const stored = localStorage.getItem(LOGO_CACHE_KEY);
      if (stored) setCached(stored);
    } catch {
      /* ignore */
    }
  }, [src]);

  const label = (name ?? "").trim();
  const effective = src ?? cached;

  if (!effective) {
    return (
      <span className={cn("font-extrabold tracking-tight text-foreground", textClassName)}>
        {label}
      </span>
    );
  }
  return <img src={effective} alt={label ? `${label} logo` : "Site logo"} className={className} />;
}
