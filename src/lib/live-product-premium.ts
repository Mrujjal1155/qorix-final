import { websiteIconMedia } from "@/lib/website-premium-icons";
import type { CategoryPremiumMedia } from "@/lib/category-premium-media";

/** An explicit empty/pending entry must not resurrect an old captured product icon. */
export function liveProductPremiumMedia(productId: string, site: Record<string, string> | undefined,
  captured: CategoryPremiumMedia | undefined): CategoryPremiumMedia | undefined {
  const key = `site_product_icon_${productId}`;
  return site && Object.prototype.hasOwnProperty.call(site, key) ? websiteIconMedia(site[key] ?? "") : captured;
}