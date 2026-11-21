import type { LucideIcon } from "lucide-react";
import { useSiteContent } from "@/lib/use-site-content";
import { websiteIconMedia } from "@/lib/website-premium-icons";
import { CategoryPremiumIcon } from "@/components/mobile/CategoryPremiumIcon";

export function WebsitePremiumIcon({ setting, fallback: Icon }: { setting: string; fallback?: LucideIcon | undefined }) {
  const { v } = useSiteContent();
  const media = websiteIconMedia(v(setting));
  return media ? <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden [&>span]:h-6 [&>span]:w-6 [&_img]:h-6 [&_img]:w-6 [&_video]:h-6 [&_video]:w-6 [&_span]:h-6 [&_span]:w-6"><CategoryPremiumIcon key={media.url} media={media} /></span>
    : Icon ? <Icon className="h-4 w-4 shrink-0" /> : null;
}