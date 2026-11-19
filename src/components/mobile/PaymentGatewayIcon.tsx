import type { LucideIcon } from "lucide-react";
import { CategoryPremiumIcon } from "@/components/mobile/CategoryPremiumIcon";
import { paymentPremiumMedia } from "@/lib/payment-premium-media";
import oxapayArtwork from "@/assets/oxapay-payment-icon.png";

/** OxaPay retains its existing artwork; other gateways use their captured bot icon. */
export function PaymentGatewayIcon({ gateway, img, icon: Icon }: { gateway: string; img?: string | undefined; icon?: LucideIcon | undefined }) {
  if (gateway === "oxapay") return <img src={img ?? oxapayArtwork} alt="" className="h-8 w-8 shrink-0 object-contain" />;
  const media = paymentPremiumMedia(gateway);
  if (media) return <CategoryPremiumIcon key={media.url} media={media} />;
  if (img) return <img src={img} alt="" className="h-8 w-8 shrink-0 object-contain" />;
  return Icon ? <Icon className="h-4 w-4 shrink-0 text-tg-link" /> : null;
}