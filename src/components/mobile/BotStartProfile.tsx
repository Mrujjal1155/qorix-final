import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Copy, CreditCard, Gem, Hand, Medal, Send, User, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ButtonPremiumIcon } from "@/components/mobile/ButtonPremiumIcon";
import { communityJoinRow } from "@/lib/bot/home-message";
import { usdPrice } from "@/lib/price-format";
import { getWebProfile, getWebSupport } from "@/lib/web-wallet.functions";

function copyValue(value: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success("Copied"),
    () => toast.error("Could not copy. Please try again."),
  );
}

function ProfileValue({ value, copyable = true }: { value: string; copyable?: boolean }) {
  if (!copyable) return <span className="block px-2.5 py-2 text-left">{value}</span>;
  return (
    <button
      type="button"
      onClick={() => copyValue(value)}
      className="block min-h-9 w-full cursor-copy break-all px-2.5 py-2 text-left font-medium text-tg-link hover:bg-tg-bubble-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tg-link"
      aria-label={`Copy ${value}`}
    >
      {value}
    </button>
  );
}

/** The same compact account card the Telegram bot sends after /start. */
export function BotStartProfile({
  signedIn,
  accountKey,
  onConnect,
}: {
  signedIn: boolean;
  accountKey: string | null;
  onConnect: () => void;
}) {
  const fetchProfile = useServerFn(getWebProfile);
  const fetchStartInfo = useServerFn(getWebSupport);
  const { data: startInfo } = useQuery({ queryKey: ["web-support"], queryFn: () => fetchStartInfo(), staleTime: 60_000 });
  const { data, isLoading } = useQuery({
    queryKey: ["web-start-profile", accountKey],
    queryFn: () => fetchProfile(),
    enabled: signedIn && Boolean(accountKey),
    staleTime: 15_000,
  });
  const linked = Boolean(signedIn && data?.linked);
  const waiting = signedIn && !data;
  const displayName = linked && data?.linked
    ? String(data.first_name || data.username || "friend").replace(/^@/, "")
    : signedIn ? "friend" : "Guest";
  const rows: Array<{ setting: string; fallback: LucideIcon; label: string; value: string; copyable: boolean }> = [
    {
      setting: "ui_icon_prof_username", fallback: CreditCard, label: "Username",
      value: linked && data?.linked ? data.username : waiting ? "Loading…" : signedIn ? "Not connected" : "Guest",
      copyable: linked,
    },
    {
      setting: "ui_icon_prof_userid", fallback: User, label: "UserID",
      value: linked && data?.linked ? String(data.telegram_id) : waiting ? "Loading…" : "Connect Telegram",
      copyable: linked,
    },
    {
      setting: "ui_icon_prof_member", fallback: Medal, label: "Membership",
      value: linked && data?.linked ? data.membership : waiting ? "Loading…" : signedIn ? "Not connected" : "Guest",
      copyable: linked,
    },
    {
      setting: "ui_icon_prof_balance", fallback: Wallet, label: "Balance",
      value: linked && data?.linked ? usdPrice(data.balance) : waiting ? "Loading…" : "—",
      copyable: linked,
    },
    {
      setting: "ui_icon_prof_spent", fallback: Gem, label: "Total Spent",
      value: linked && data?.linked ? usdPrice(data.total_spent) : waiting ? "Loading…" : "—",
      copyable: linked,
    },
  ];
  const banner = startInfo?.startBanner ?? null;
  const community = startInfo?.startCommunity ?? communityJoinRow({});
  const communityIcons = [
    { setting: "ui_icon_home_group", fallback: User },
    { setting: "ui_icon_home_channel", fallback: Send },
    { setting: "ui_icon_home_updates", fallback: BadgeCheck },
  ];

  return (
    <div className="w-[94%] max-w-none shrink-0 self-start overflow-hidden rounded-2xl rounded-bl-md bg-tg-bubble shadow-sm">
      {banner && <img src={banner} alt="QORIX Store — Premium AI and software, delivered in seconds" className="aspect-[1920/691] w-full object-cover" />}
      <div className="px-3.5 py-2.5">
        <p className="flex items-center gap-2 text-[15px]">
          <ButtonPremiumIcon setting="ui_icon_home_greet" fallback={Hand} />
          <span>Welcome back, <b className="break-words">{displayName}</b></span>
        </p>
        <div className="mt-2 overflow-hidden rounded-md border border-tg-bubble-fg/15 text-sm">
          {rows.map((row, index) => (
            <div key={row.label} className={`grid grid-cols-2 border-b border-tg-bubble-fg/10 last:border-0 ${index % 2 ? "bg-tg-bubble-fg/5" : ""}`}>
              <div className="flex min-w-0 items-center gap-2 border-r border-tg-bubble-fg/10 px-2.5 py-2">
                <ButtonPremiumIcon setting={row.setting} fallback={row.fallback} />
                <span className="truncate">{row.label}</span>
              </div>
              <div className="min-w-0">
                <ProfileValue value={row.value} copyable={row.copyable} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm">{linked ? "Tap any value to copy it." : "Connect Telegram to see your real account details."}</p>
        {linked && data?.linked && data.referral_link ? (
          <button
            type="button"
            onClick={() => copyValue(data.referral_link!)}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-tg-bubble-fg/5 px-3 text-sm font-medium hover:bg-tg-bubble-fg/10"
          >
            <span>Copy invite link</span><Copy className="h-3.5 w-3.5" />
          </button>
        ) : !signedIn || data?.linked === false ? (
          <button
            type="button"
            onClick={onConnect}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-tg-btn-green px-3 text-sm font-semibold text-tg-btn-fg"
          >
            <ButtonPremiumIcon setting="site_web_icon_connect_button" fallback={Send} /> Connect Telegram
          </button>
        ) : null}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {community.map((item, index) => {
            const icon = communityIcons[index]!;
            return (
              <a
                key={item.text}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-full bg-tg-btn-green/15 px-1.5 py-1.5 text-[11px] font-semibold text-tg-btn-green hover:bg-tg-btn-green/25"
              >
                <ButtonPremiumIcon setting={icon.setting} fallback={icon.fallback} />
                <span className="min-w-0 break-words text-center leading-tight">{item.text}</span>
              </a>
            );
          })}
        </div>
        <p className="mt-2 flex items-center gap-2 text-sm">
          <ButtonPremiumIcon setting="ui_icon_home_choose" />
          <span>Choose an option below to get started.</span>
        </p>
        {isLoading && signedIn && <span className="sr-only">Loading Telegram profile</span>}
      </div>
    </div>
  );
}
