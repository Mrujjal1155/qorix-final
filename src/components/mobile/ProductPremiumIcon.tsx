import { CategoryPremiumIcon } from "@/components/mobile/CategoryPremiumIcon";
import { productPremiumMedia } from "@/lib/product-premium-media";

export function ProductPremiumIcon({ productId }: { productId: string }) {
  const media = productPremiumMedia(productId);
  return media ? <CategoryPremiumIcon key={media.url} media={media} /> : null;
}