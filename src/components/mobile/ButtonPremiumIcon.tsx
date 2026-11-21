import type { LucideIcon } from "lucide-react";
import { buttonPremiumMedia } from "@/lib/button-premium-media";
import { CategoryPremiumIcon } from "@/components/mobile/CategoryPremiumIcon";
import { productMessagePremiumMedia } from "@/lib/product-message-premium-media";
import { WebsitePremiumIcon } from "@/components/mobile/WebsitePremiumIcon";

/** Exact captured bot setting, with the original website icon when unset. */
export function ButtonPremiumIcon({ setting, fallback: Icon }: { setting: string; fallback?: LucideIcon | undefined }) {
  if (setting.startsWith("site_web_icon_")) return <WebsitePremiumIcon setting={setting} fallback={Icon} />;
  const media = buttonPremiumMedia(setting) ?? productMessagePremiumMedia(setting);
  return media ? <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden [&>span]:h-6 [&>span]:w-6 [&_img]:h-6 [&_img]:w-6 [&_video]:h-6 [&_video]:w-6 [&_span]:h-6 [&_span]:w-6"><CategoryPremiumIcon media={media} /></span>
    : Icon ? <Icon className="h-4 w-4 shrink-0" /> : null;
}