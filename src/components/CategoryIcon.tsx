import { useState } from "react";
import {
  Bot,
  Boxes,
  Clapperboard,
  Gamepad2,
  Globe,
  GraduationCap,
  Image,
  KeyRound,
  Layers,
  LineChart,
  Music,
  Palette,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const RULES: Array<[RegExp, LucideIcon]> = [
  [/\b(ai|gpt|chat|bot|claude|gemini)\b/i, Bot],
  [/design|creative|canva|photo|art/i, Palette],
  [/image|stock|midjourney/i, Image],
  [/vpn|security|privacy|proxy/i, ShieldCheck],
  [/stream|netflix|prime|movie|video|youtube/i, Clapperboard],
  [/music|spotify|audio/i, Music],
  [/social|follow|like|smm/i, Users],
  [/game|gaming|steam/i, Gamepad2],
  [/product|office|work|note|task/i, Layers],
  [/course|learn|edu|academy/i, GraduationCap],
  [/key|licen[cs]e|account|code/i, KeyRound],
  [/marketing|seo|analytic|traffic/i, LineChart],
  [/app|mobile|android|ios/i, Smartphone],
  [/tool|util|software/i, Wrench],
  [/web|domain|host|site/i, Globe],
  [/shop|store|bundle/i, ShoppingBag],
  [/premium|pro|vip|hot|new/i, Sparkles],
];

export function categoryIcon(name?: string | null): LucideIcon {
  const n = name ?? "";
  for (const [re, Icon] of RULES) if (re.test(n)) return Icon;
  return Boxes;
}

const SPARE_ICONS: LucideIcon[] = [
  Boxes, Globe, Wrench, ShoppingBag, Sparkles, Layers, KeyRound, Smartphone, LineChart, Users,
  GraduationCap, Gamepad2, Music, Clapperboard, ShieldCheck, Image, Palette, Bot,
];

/** One icon per category name with no repeats in the list (best match first, then a spare). */
export function distinctCategoryIcons(names: string[]): Map<string, LucideIcon> {
  const used = new Set<LucideIcon>();
  const out = new Map<string, LucideIcon>();
  for (const n of names) {
    let pick: LucideIcon | undefined;
    for (const [re, Icon] of RULES) if (re.test(n) && !used.has(Icon)) { pick = Icon; break; }
    pick ??= SPARE_ICONS.find((i) => !used.has(i)) ?? categoryIcon(n);
    used.add(pick);
    out.set(n, pick);
  }
  return out;
}

export function CategoryIcon({
  name,
  src,
  icon,
  className = "h-5 w-5",
}: {
  name?: string | null;
  /** Explicit icon (e.g. from distinctCategoryIcons) — overrides the name match. */
  icon?: LucideIcon | undefined;
  /** Admin-uploaded category logo; falls back to the matching icon when missing or broken. */
  src?: string | null | undefined;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = icon ?? categoryIcon(name);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ?? "Category"}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${className} object-contain`}
      />
    );
  }
  return <Icon className={className} />;
}
