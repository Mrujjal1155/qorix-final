import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { checkBinanceStatus, checkBotToken, getBotSettings, registerWebhook, saveBinanceKeys, saveBotSettings, sendTestEmail, getEmailStatus } from "@/lib/admin.functions";
import { AdminShell } from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { BinanceSetupCard } from "@/components/BinanceSetupCard";
import { HeroItemsCard } from "@/components/HeroItemsCard";
import { SettingsHub, type HubSection } from "@/components/SettingsHub";
import { Bot, Wallet, SlidersHorizontal, Smile, Images, Megaphone, Smartphone, Mail, MailOpen, Gift, Coins, Network } from "lucide-react";
import { CurrencyRatesCard } from "@/components/CurrencyRatesCard";
import { SupplierKeysCard } from "@/components/SupplierKeysCard";
import { EmailTemplatesCard } from "@/components/EmailTemplatesCard";
import { PRODUCTION_SITE_URL } from "@/lib/site-url";


export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Shop Bot Admin" },
      { name: "description", content: "Configure bot name, welcome text, payment addresses, admin IDs and register the Telegram webhook." },
      { property: "og:title", content: "Settings — Shop Bot Admin" },
      { property: "og:description", content: "Bot configuration and webhook registration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const FIELDS: { key: string; label: string; long?: boolean; help?: string }[] = [
  { key: "bot_name", label: "Bot name" },
  { key: "welcome_text", label: "Welcome text", long: true },
  // USDT addresses live in the Binance Setup card above

  { key: "bkash_number", label: "bKash number (manual fallback)" },
  { key: "nagad_number", label: "Nagad number (manual fallback)" },

  { key: "bot_link", label: "Bot link (https://t.me/...)" },

  // notify_email lives in the Email settings section


  { key: "announce_chat_id", label: "Announcement channel/group ID", help: "Make the bot an admin in the channel or group, then get the ID with @userinfobot and paste it here." },
  { key: "announce_restock_title", label: "Restock post title (e.g. 🔥 BACK IN STOCK)" },
  { key: "announce_restock_footer", label: "Restock post footer line", long: true },
  { key: "announce_new_title", label: "New product post title (e.g. 🆕 NEW PRODUCT)" },
  { key: "announce_new_footer", label: "New product post footer line", long: true },

  { key: "announce_sale_text", label: "Sale post text — {user} {qty} {product} {price}", long: true },
  { key: "announce_claim_text", label: "Free claim post text — {user} {product}", long: true },
  { key: "admin_ids", label: "Admin telegram IDs (comma separated)" },
  { key: "support_link", label: "Support link (t.me/...)" },
  { key: "support_text", label: "Support page text", long: true },
  { key: "referral_percent", label: "Referral commission % (Telegram bot)" },
  { key: "referral_credit_per_invite", label: "Referral credits per invite (default 1)" },
  { key: "referral_daily_cap", label: "Counted invites per day (default 10)" },
  { key: "referral_redeem_rate", label: "Wallet value per credit (0 = disable redeem)" },
  { key: "referral_rewards", label: "Referral store rewards — one per line: Name|credits", long: true },
  { key: "flash_ends_at", label: "Flash sale ends at (ISO date, e.g. 2026-09-01T18:00:00Z)" },
  { key: "quick_guide_text", label: "Quick Guide text (shown on product pages)", long: true },
  { key: "freebies_text", label: "Freebies page", long: true },
  { key: "emails_trials_link", label: "Emails & Trials link (https://...)" },
  { key: "emails_trials_text", label: "Emails & Trials page", long: true },
  { key: "reseller_api_text", label: "Reseller API page", long: true },
  { key: "supplier_sync_minutes", label: "Supplier auto-sync interval (minutes, default 2)" },
];

const TOGGLE_FIELDS: { key: string; label: string; description?: string }[] = [
  { key: "announce_sales", label: "Live sales posts", description: "A sale message is posted to the channel/group after every purchase." },
  { key: "announce_restock", label: "Restock alerts", description: "A BACK IN STOCK post goes to the channel/group when new stock is added." },
  { key: "announce_new", label: "New product posts", description: "When a supplier product is turned ON from admin, a NEW PRODUCT post goes to the channel/group. Products left OFF only appear in admin alerts." },
  { key: "announce_dm", label: "Bot DM copies", description: "Restock and new product alerts are also sent as DMs to every bot user, not just the group." },
  {
    key: "supplier_autosync",
    label: "Supplier auto-sync",
    description: "Pulls new products/stock from the supplier API every few minutes (default 2 minutes); when a listed product gets stock, a post goes to the group.",
  },
];


const MENU_ICON_FIELDS = [
  ["menu_icon_shop", "Shop"],
  ["menu_icon_cart", "Cart"],
  ["menu_icon_orders", "Orders"],
  ["menu_icon_wallet", "Wallet"],
  ["menu_icon_freebies", "Freebies"],
  ["menu_icon_profile", "Profile"],
  ["menu_icon_referral", "Referral Store"],
  ["menu_icon_support", "Support"],
  ["menu_icon_emails", "Emails & Trials"],
  ["menu_icon_api", "Reseller API"],
  ["menu_icon_clear", "Clear Chat"],
  ["menu_icon_refresh", "Refresh"],
  ["menu_icon_back", "Back / Main Menu"],
] as const;

function SettingsPage() {
  const fetchSettings = useServerFn(getBotSettings);
  const save = useServerFn(saveBotSettings);
  const hook = useServerFn(registerWebhook);
  const checkToken = useServerFn(checkBotToken);
  const checkBinance = useServerFn(checkBinanceStatus);
  const saveKeys = useServerFn(saveBinanceKeys);
  const sendTest = useServerFn(sendTestEmail);
  const fetchEmailStatus = useServerFn(getEmailStatus);
  const [savingKeys, setSavingKeys] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { data, refetch: refetchSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => fetchSettings(),
    refetchOnWindowFocus: false,
  });
  const { data: tokenStatus, isLoading: tokenLoading } = useQuery({
    queryKey: ["bot-token-status"],
    queryFn: () => checkToken(),
    refetchOnWindowFocus: false,
  });
  const { data: binanceStatus, refetch: refetchBinance } = useQuery({
    queryKey: ["binance-status"],
    queryFn: () => checkBinance(),
    refetchOnWindowFocus: false,
  });
  const { data: emailStatus, isLoading: emailStatusLoading, refetch: refetchEmailStatus } = useQuery({
    queryKey: ["email-status"],
    queryFn: () => fetchEmailStatus(),
    refetchOnWindowFocus: false,
  });
  const tokenOk = tokenStatus?.status === "ok";
  const [values, setValues] = useState<Record<string, string>>({});
  // Last snapshot from the server. A refetch must never wipe fields the admin
  // is still typing into, so only untouched keys are refreshed.
  const serverValues = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(data)) {
        const wasEdited = Object.prototype.hasOwnProperty.call(prev, k) && prev[k] !== serverValues.current[k];
        if (!wasEdited) next[k] = v as string;
      }
      return next;
    });
    serverValues.current = { ...(data as Record<string, string>) };
  }, [data]);


  function isOn(value: string | undefined) {
    const v = (value ?? "").toString().trim().toLowerCase();
    return v === "on" || v === "true" || v === "1" || v === "yes";
  }

  function setToggle(key: string, checked: boolean) {
    setValues((prev) => ({ ...prev, [key]: checked ? "on" : "off" }));
  }

  async function onSave() {
    try {
      await save({ data: { values } });
      toast.success("Settings saved");
      await refetchSettings();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }


  async function onSaveKeys(apiKey: string, secretKey: string) {
    setSavingKeys(true);
    try {
      const r = await saveKeys({ data: { apiKey, secretKey } });
      if (r.ok) {
        toast.success(r.message);
        await refetchBinance();
      } else toast.error(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingKeys(false);
    }
  }

  async function onConnect() {
    if (tokenStatus && !tokenOk) {
      toast.error(tokenStatus.message);
      return;
    }
    try {
      const r = await hook({ data: { origin: PRODUCTION_SITE_URL } });
      if (r.ok) toast.success("Webhook registered");
      else toast.error(r.message ?? "Webhook registration failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function onSaveEmail() {
    await onSave();
    await refetchEmailStatus();
  }

  async function onSendTest() {
    const to = (testTo || values["notify_email"] || "").trim();
    if (!to) {
      toast.error("Enter an email address first");
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      const r = await sendTest({ data: { to } });
      setTestResult({ ok: r.ok, message: r.message });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed";
      setTestResult({ ok: false, message });
      toast.error(message);
    } finally {
      setSendingTest(false);
    }
  }

  const emailToggles: { key: string; label: string; description: string }[] = [
    {
      key: "email_receipt_enabled",
      label: "Order receipt to buyer",
      description: "An invoice/receipt email is sent to the customer after a website order.",
    },
    {
      key: "email_admin_notify_enabled",
      label: "Admin new-order notification",
      description: "A notification is sent to the admin address below when a new website order arrives.",
    },
    {
      key: "email_reseller_enabled",
      label: "Reseller approval email",
      description: "A branded welcome email is sent when a reseller application is approved.",
    },
  ];

  const emailCard = (
    <Card>
      <CardHeader>
        <CardTitle>Email settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border border-border/70 bg-card/50 p-4 text-sm">
          {emailStatusLoading || !emailStatus ? (
            <p className="text-muted-foreground">Checking email delivery status…</p>
          ) : (
            <>
              <p className={emailStatus.apiKeyConfigured ? "text-primary" : "text-destructive"}>
                {emailStatus.apiKeyConfigured
                  ? "✅ Resend API key configured"
                  : "⚠️ RESEND_API_KEY missing — no emails can be sent"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Current sender: <code className="rounded bg-muted px-1 py-0.5">{emailStatus.from}</code>
              </p>
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Sender name</Label>
            <Input
              value={values["email_from_name"] ?? ""}
              onChange={(e) => setValues({ ...values, email_from_name: e.target.value })}
              placeholder="Qorix Store"
            />
          </div>
          <div className="space-y-1">
            <Label>Sender email address</Label>
            <Input
              type="email"
              value={values["email_from_address"] ?? ""}
              onChange={(e) => setValues({ ...values, email_from_address: e.target.value.trim() })}
              placeholder="noreply@qorixlab.com"
            />
            <p className="text-xs text-muted-foreground">
              Use an address from a domain verified in Resend, otherwise sending will fail.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Reply-to address (optional)</Label>
            <Input
              type="email"
              value={values["email_reply_to"] ?? ""}
              onChange={(e) => setValues({ ...values, email_reply_to: e.target.value.trim() })}
              placeholder="support@qorixlab.com"
            />
          </div>
          <div className="space-y-1">
            <Label>Admin order notification email</Label>
            <Input
              type="email"
              value={values["notify_email"] ?? ""}
              onChange={(e) => setValues({ ...values, notify_email: e.target.value.trim() })}
              placeholder="admin@qorixlab.com"
            />
            <p className="text-xs text-muted-foreground">
              Notifications for new website orders are sent to this email.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {emailToggles.map((t) => (
            <div
              key={t.key}
              className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-card/50 p-4"
            >
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold">{t.label}</Label>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
              <Switch
                checked={isOn(values[t.key] ?? "on")}
                onCheckedChange={(c) => setToggle(t.key, c)}
                aria-label={t.label}
              />
            </div>
          ))}
        </div>

        <Button onClick={onSaveEmail}>Save email settings</Button>

        <div className="space-y-4 rounded-xl border border-border/70 bg-card/50 p-4">
          <div>
            <Label className="text-sm font-semibold">Email delivery test</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Send a test email to an address — you will immediately see whether the Resend API key, sender domain and SPF/DKIM are correct.
              If it does not arrive in the inbox, check the spam folder too.
            </p>
          </div>
          <Input
            type="email"
            autoComplete="off"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder={values["notify_email"] || "you@example.com"}
          />
          <p className="text-xs text-muted-foreground">
            If left empty, it is sent to the admin notification email address.
          </p>
          <Button variant="outline" onClick={onSendTest} disabled={sendingTest}>
            {sendingTest ? "Sending…" : "Send test email"}
          </Button>
          {testResult && (
            <p className={`text-sm ${testResult.ok ? "text-primary" : "text-destructive"}`}>
              {testResult.ok ? "✅ " : "⚠️ "}
              {testResult.message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );


  const tokenCard = (
    <Card
      className={
        tokenLoading || !tokenStatus ? "" : tokenOk ? "border-primary/40" : "border-destructive/50"
      }
    >
      <CardHeader>
        <CardTitle>Telegram bot token</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tokenLoading || !tokenStatus ? (
          <p className="text-sm text-muted-foreground">Checking bot token…</p>
        ) : (
          <>
            <p className={`text-sm ${tokenOk ? "text-primary" : "text-destructive"}`}>
              {tokenOk ? "✅ " : "⚠️ "}
              {tokenStatus.message}
            </p>
            {!tokenOk && (
              <p className="text-xs text-muted-foreground">
                Open @BotFather in Telegram → /mybots → API Token, then save it as the
                TELEGRAM_BOT_TOKEN secret and reload this page.
              </p>
            )}
          </>
        )}
        <Button variant="outline" onClick={onConnect} disabled={!tokenOk}>
          Connect webhook
        </Button>
      </CardContent>
    </Card>
  );

  const configCard = (
    <Card>
      <CardHeader>
        <CardTitle>Bot configuration</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={`space-y-1 ${f.long ? "sm:col-span-2" : ""}`}>
            <Label>{f.label}</Label>
            {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
            {f.long ? (
              <Textarea
                rows={3}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            ) : (
              <Input
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </div>
        ))}
        <div className="flex gap-2 sm:col-span-2">
          <Button onClick={onSave}>Save settings</Button>
        </div>
      </CardContent>
    </Card>
  );

  const iconsCard = (
    <Card>
      <CardHeader>
        <CardTitle>Telegram menu icons</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter only a Premium emoji ID (e.g. 5400280896311944960) or a plain emoji in each field. Paste an ID and messages show the Premium emoji while buttons show an automatic fallback emoji.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {MENU_ICON_FIELDS.map(([key, label]) => {
            const raw = (values[key] ?? "").trim();
            const [maybeId, maybeGlyph] = raw.includes("|") ? raw.split("|") : [raw, ""];
            const isId = /^\d{8,}$/.test(maybeId ?? "");
            const glyph = (isId ? maybeGlyph : raw) || "";
            return (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input
                  value={values[key] ?? ""}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value.trim() })}
                  placeholder="Emoji or custom emoji ID"
                />
                <p className="text-xs text-muted-foreground">
                  {raw
                    ? isId
                      ? `Premium icon ✨ ${glyph || ""} (id ${maybeId})`
                      : `Icon ${glyph}`
                    : "Using the default icon"}
                </p>
              </div>
            );
          })}

        </div>
        <Button onClick={onSave}>Save menu icons</Button>
      </CardContent>
    </Card>
  );

  const announceCard = (
    <Card>
      <CardHeader>
        <CardTitle>Announcement switches</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Enter the channel/group ID, then use the switches below to choose which posts stay on or off.
        </p>
        {TOGGLE_FIELDS.map((t) => (
          <div key={t.key} className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-card/50 p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">{t.label}</Label>
              {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
            </div>
            <Switch
              checked={isOn(values[t.key])}
              onCheckedChange={(checked) => setToggle(t.key, checked)}
              aria-label={t.label}
            />
          </div>
        ))}
        <Button onClick={onSave}>Save announcement settings</Button>
      </CardContent>
    </Card>
  );
  const PAYKORI_METHOD_LIST = [
    ["bkash", "bKash"],
    ["nagad", "Nagad"],
    ["rocket", "Rocket"],
  ] as const;
  const selectedMethods = (values["paykori_methods"] ?? "bkash,nagad,rocket")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  function toggleMethod(m: string, on: boolean) {
    const next = on
      ? Array.from(new Set([...selectedMethods, m]))
      : selectedMethods.filter((x) => x !== m);
    setValues({ ...values, paykori_methods: next.join(",") });
  }

  const paykoriCard = (
    <Card>
      <CardHeader>
        <CardTitle>Mobile banking — Pay Kori (bKash / Nagad / Rocket)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Get the Brand API key from the Pay Kori dashboard. Use this as the webhook URL:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {PRODUCTION_SITE_URL}/api/public/paykori/webhook
          </code>
          . Payments are always verified with the gateway from the server, so fake confirmations will not work.
        </p>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-card/50 p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-semibold">Pay Kori enabled</Label>
            <p className="text-xs text-muted-foreground">
              When off, the bot will not show bKash / Nagad / Rocket buttons.
            </p>
          </div>
          <Switch
            checked={isOn(values["paykori_enabled"])}
            onCheckedChange={(c) => setToggle("paykori_enabled", c)}
            aria-label="Pay Kori enabled"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Pay Kori API key</Label>
            <p className="text-xs text-muted-foreground">
              Brand API key — used server-side only, never visible to users.
            </p>
            <Input
              type="password"
              autoComplete="off"
              value={values["paykori_key"] ?? ""}
              onChange={(e) => setValues({ ...values, paykori_key: e.target.value.trim() })}
              placeholder="pk_live_..."
            />
          </div>
          <div className="space-y-1">
            <Label>USD → BDT rate</Label>
            <Input
              inputMode="decimal"
              value={values["bdt_rate"] ?? ""}
              onChange={(e) => setValues({ ...values, bdt_rate: e.target.value })}
              placeholder="129"
            />
          </div>
          <div className="space-y-1">
            <Label>API base URL (optional)</Label>
            <Input
              value={values["paykori_base"] ?? ""}
              onChange={(e) => setValues({ ...values, paykori_base: e.target.value.trim() })}
              placeholder="https://checkout.paykori.online/api"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Enabled methods</Label>
          <div className="flex flex-wrap gap-3">
            {PAYKORI_METHOD_LIST.map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/50 px-4 py-2"
              >
                <Switch
                  checked={selectedMethods.includes(key)}
                  onCheckedChange={(c) => toggleMethod(key, c)}
                  aria-label={label}
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border/70 bg-card/50 p-4">
          <Label className="text-sm font-semibold">Payment method icons</Label>
          <p className="text-xs text-muted-foreground">
            bKash, Nagad and Rocket icons can only be changed from the Telegram bot admin. In the bot go to /admin → "Payment icons" and send a Premium emoji to update.
          </p>
        </div>

    <Button onClick={onSave}>Save Pay Kori settings</Button>
      </CardContent>
    </Card>
  );

  const epsCard = (
    <Card>
      <CardHeader>
        <CardTitle>Website payments — EPS (bKash / Nagad / Rocket / Visa / Mastercard)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Credentials come from the EPS merchant panel and stay on the server. Give EPS this return URL:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{PRODUCTION_SITE_URL}/api/public/eps/return</code> (use it
          for success, fail and cancel), and this IPN / notification URL:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{PRODUCTION_SITE_URL}/api/public/eps/ipn</code>. Every
          payment is re-verified with EPS before an order is marked paid.
        </p>


        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-card/50 p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-semibold">EPS enabled</Label>
            <p className="text-xs text-muted-foreground">
              When off, the website checkout only offers the crypto methods.
            </p>
          </div>
          <Switch
            checked={isOn(values["eps_enabled"])}
            onCheckedChange={(c) => setToggle("eps_enabled", c)}
            aria-label="EPS enabled"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Merchant user name</Label>
            <Input
              autoComplete="off"
              value={values["eps_username"] ?? ""}
              onChange={(e) => setValues({ ...values, eps_username: e.target.value.trim() })}
              placeholder="merchant user name"
            />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input
              type="password"
              autoComplete="off"
              value={values["eps_password"] ?? ""}
              onChange={(e) => setValues({ ...values, eps_password: e.target.value })}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Hash key</Label>
            <Input
              type="password"
              autoComplete="off"
              value={values["eps_hash_key"] ?? ""}
              onChange={(e) => setValues({ ...values, eps_hash_key: e.target.value.trim() })}
              placeholder="hash key from EPS"
            />
          </div>
          <div className="space-y-1">
            <Label>Merchant ID</Label>
            <Input
              value={values["eps_merchant_id"] ?? ""}
              onChange={(e) => setValues({ ...values, eps_merchant_id: e.target.value.trim() })}
              placeholder="e.g. 21"
            />
          </div>
          <div className="space-y-1">
            <Label>Store ID</Label>
            <Input
              value={values["eps_store_id"] ?? ""}
              onChange={(e) => setValues({ ...values, eps_store_id: e.target.value.trim() })}
              placeholder="e.g. 33"
            />
          </div>
          <div className="space-y-1">
            <Label>USD → BDT rate</Label>
            <Input
              inputMode="decimal"
              value={values["bdt_rate"] ?? ""}
              onChange={(e) => setValues({ ...values, bdt_rate: e.target.value })}
              placeholder="129"
            />
          </div>
          <div className="space-y-1">
            <Label>API base URL (optional)</Label>
            <Input
              value={values["eps_base"] ?? ""}
              onChange={(e) => setValues({ ...values, eps_base: e.target.value.trim() })}
              placeholder="https://pgapi.eps.com.bd"
            />
          </div>
        </div>

        <Button onClick={onSave}>Save EPS settings</Button>
      </CardContent>
    </Card>
  );


  const referralCard = (
    <Card>
      <CardHeader>
        <CardTitle>Referral program (website)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          When someone signs up through a referral link and completes an order, commission is credited automatically to the referrer's wallet at the rate below.
          The Telegram bot referral program is separate (Bot configuration section).
        </p>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-card/50 p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-semibold">Referral program enabled</Label>
            <p className="text-xs text-muted-foreground">When turned off, no new commission is credited.</p>
          </div>
          <Switch
            checked={isOn(values["web_referral_enabled"] ?? "on")}
            onCheckedChange={(c) => setToggle("web_referral_enabled", c)}
            aria-label="Referral program enabled"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Commission percent (%)</Label>
            <Input
              inputMode="decimal"
              value={values["web_referral_percent"] ?? ""}
              onChange={(e) => setValues({ ...values, web_referral_percent: e.target.value.trim() })}
              placeholder="2"
            />
            <p className="text-xs text-muted-foreground">The referrer gets this % of every completed order (default 2).</p>
          </div>
          <div className="space-y-1">
            <Label>Minimum order amount (USD)</Label>
            <Input
              inputMode="decimal"
              value={values["web_referral_min_order"] ?? ""}
              onChange={(e) => setValues({ ...values, web_referral_min_order: e.target.value.trim() })}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">No commission for orders below this amount (0 = no condition).</p>
          </div>
          <div className="space-y-1">
            <Label>Max commission per order (USD)</Label>
            <Input
              inputMode="decimal"
              value={values["web_referral_max_commission"] ?? ""}
              onChange={(e) => setValues({ ...values, web_referral_max_commission: e.target.value.trim() })}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">Maximum commission per order (0 = no limit).</p>
          </div>
        </div>

        <Button onClick={onSave}>Save referral settings</Button>
      </CardContent>
    </Card>
  );



  const sections: HubSection[] = [
    {
      id: "token",
      title: "Bot token & webhook",
      description: "Check the Telegram bot token and register the webhook.",
      icon: Bot,
      render: () => tokenCard,
    },
    {
      id: "binance",
      title: "Binance payments",
      description: "API keys, USDT addresses and payment verification setup.",
      icon: Wallet,
      render: () => (
        <BinanceSetupCard
          values={values}
          setValues={setValues}
          onSave={onSave}
          apiStatus={binanceStatus}
          onSaveKeys={onSaveKeys}
          savingKeys={savingKeys}
        />
      ),
    },
    {
      id: "paykori",
      title: "Mobile banking (Pay Kori)",
      description: "bKash, Nagad, Rocket — API key, USD→BDT rate and methods.",
      icon: Smartphone,
      render: () => paykoriCard,
    },
    {
      id: "eps",
      title: "Website payments (EPS)",
      description: "bKash, Nagad, Rocket, Visa and Mastercard on the website checkout.",
      icon: Smartphone,
      render: () => epsCard,
    },


    {
      id: "config",
      title: "Bot configuration",
      description: "Bot name, welcome text, support, referral and page texts.",
      icon: SlidersHorizontal,
      render: () => configCard,
    },
    {
      id: "icons",
      title: "Telegram menu icons",
      description: "Premium emoji IDs for every bot menu button.",
      icon: Smile,
      render: () => iconsCard,
    },
    {
      id: "hero",
      title: "Hero items",
      description: "Products and logos shown in the website hero animation.",
      icon: Images,
      render: () => <HeroItemsCard />,
    },
    {
      id: "announce",
      title: "Announcements",
      description: "Channel posts for sales, restocks and new products.",
      icon: Megaphone,
      render: () => announceCard,
    },
    {
      id: "email",
      title: "Email settings",
      description: "Sender address, notifications, on/off switches and a delivery test.",
      icon: Mail,
      render: () => emailCard,
    },
    {
      id: "email-templates",
      title: "Email templates",
      description: "See every email the site sends and preview its design.",
      icon: MailOpen,
      render: () => <EmailTemplatesCard />,
    },
    {
      id: "referral",
      title: "Referral program",
      description: "Website referral commission %, minimum order and per-order cap.",
      icon: Gift,
      render: () => referralCard,
    },
    {
      id: "supplier-apis",
      title: "Supplier APIs",
      description: "Add each supplier's API key and base URL, test the connection and turn it on or off.",
      icon: Network,
      render: () => <SupplierKeysCard />,
    },
    {
      id: "currency",
      title: "Currency rates",
      description: "Set your own conversion rate for each currency shown on the site.",
      icon: Coins,
      render: () => <CurrencyRatesCard />,
    },
  ];

  return (
    <AdminShell title="Settings" subtitle="Tap a section to configure it.">
      <SettingsHub sections={sections} />
    </AdminShell>
  );
}
