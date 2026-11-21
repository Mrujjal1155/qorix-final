import { CategoryPremiumIcon } from "@/components/mobile/CategoryPremiumIcon";
import { productPremiumMedia } from "@/lib/product-premium-media";
import { liveProductPremiumMedia } from "@/lib/live-product-premium";
import { useSiteContent } from "@/lib/use-site-content";
import type { ReactNode } from "react";

export function ProductPremiumIcon({ productId, fallback = null }: { productId: string; fallback?: ReactNode }) {
  const { site } = useSiteContent();
  const media = liveProductPremiumMedia(productId, site, productPremiumMedia(productId));
  return media ? <CategoryPremiumIcon key={media.url} media={media} /> : fallback;
}