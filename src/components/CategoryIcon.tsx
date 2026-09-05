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

export function CategoryIcon({ name, className = "h-5 w-5" }: { name?: string | null; className?: string }) {
  const Icon = categoryIcon(name);
  return <Icon className={className} />;
}
