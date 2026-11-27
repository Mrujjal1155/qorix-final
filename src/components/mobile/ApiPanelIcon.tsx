import type { LucideIcon } from "lucide-react";
import type { ApiPanelIconData } from "@/lib/api-panel-icons";
import { CategoryPremiumIcon } from "@/components/mobile/CategoryPremiumIcon";

/** Exact bot API-panel artwork: Premium emoji media when the bot has one, otherwise the same plain glyph. */
export function ApiPanelIcon({ icon, fallback: Icon }: { icon?: ApiPanelIconData | undefined; fallback?: LucideIcon | undefined }) {
  if (icon?.media) return <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden [&>span]:h-6 [&>span]:w-6 [&_img]:h-6 [&_img]:w-6 [&_video]:h-6 [&_video]:w-6 [&_span]:h-6 [&_span]:w-6"><CategoryPremiumIcon media={icon.media} /></span>;
  if (icon?.glyph) return <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none">{icon.glyph}</span>;
  return Icon ? <Icon className="h-4 w-4 shrink-0" /> : null;
}
