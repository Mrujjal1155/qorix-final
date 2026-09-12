import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getBotSettings, saveBotSettings } from "@/lib/admin.functions";
import { AdminShell } from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { SITE_DEFAULTS } from "@/lib/site-content";
import { ImageUploadField } from "@/components/ImageUploadField";
import { Sparkles, Menu, LayoutList, Link2, LifeBuoy, Phone, Share2, Info, HelpCircle, MessageSquare, Scale, type LucideIcon } from "lucide-react";
import { SettingsHub, type HubSection } from "@/components/SettingsHub";
import { broadcastSiteUpdate } from "@/lib/site-refresh";

export const Route = createFileRoute("/admin/site")({
  head: () => ({
    meta: [
      { title: "Website content — Shop Admin" },
      { name: "description", content: "Edit header navigation, footer columns, contact details and copyright of the storefront." },
      { property: "og:title", content: "Website content — Shop Admin" },
      { property: "og:description", content: "Make every part of the website editable from the admin panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SitePage,
});

type Field = { key: string; label: string; hint?: string; long?: boolean; image?: boolean };

const GROUPS: { title: string; desc: string; icon: LucideIcon; fields: Field[] }[] = [
  {
    title: "Brand",
    desc: "Site name, logo, favicon, share image and footer tagline.",
    icon: Sparkles,
    fields: [
      { key: "site_brand_name", label: "Brand name" },
      { key: "site_brand_suffix", label: "Brand suffix (e.g. .shop)" },
      {
        key: "site_brand_logo",
        label: "Site logo (header + footer)",
        hint: "Used everywhere once uploaded. Leave empty for the default QORIX logo. Best size: 400×120 px PNG (transparent), under 300KB.",
        image: true,
      },
      {
        key: "site_favicon",
        label: "Favicon (browser tab icon)",
        hint: "Square icon shown in the browser tab. Best size: 512×512 px PNG (transparent), min 256×256. Leave empty for the default QORIX favicon.",
        image: true,
      },
      {
        key: "site_apple_icon",
        label: "Apple touch icon (iOS home screen)",
        hint: "Square icon, no transparency needed. Best size: 180×180 px PNG (512×512 also fine). Leave empty to reuse the favicon.",
        image: true,
      },
      {
        key: "site_og_image",
        label: "Social share image (OG image)",
        hint: "Preview card shown on Facebook / WhatsApp / Telegram / X. Exact size: 1200×630 px PNG or JPG, under 1MB. Leave empty for the default QORIX share image.",
        image: true,
      },
      { key: "site_tagline", label: "Footer tagline", long: true },
    ],
  },
  {
    title: "Header menu",
    desc: "Top navigation links of the website.",
    icon: Menu,
    fields: [{ key: "site_nav", label: "Menu items — one per line: Label|/path", long: true }],
  },
  {
    title: "Footer — Categories",
    desc: "Footer category column title and links.",
    icon: LayoutList,
    fields: [
      { key: "site_footer_categories_title", label: "Column title" },
      { key: "site_footer_categories", label: "Links — one per line: Label|/path", long: true },
      { key: "site_footer_categories_more", label: "Bottom link (View All|/store)" },
    ],
  },
  {
    title: "Footer — Quick Links",
    desc: "Footer quick links column.",
    icon: Link2,
    fields: [
      { key: "site_footer_quick_title", label: "Column title" },
      { key: "site_footer_quick", label: "Links — one per line: Label|/path", long: true },
    ],
  },
  {
    title: "Footer — Support",
    desc: "Footer support column links.",
    icon: LifeBuoy,
    fields: [
      { key: "site_footer_support_title", label: "Column title" },
      { key: "site_footer_support", label: "Links — one per line: Label|/path", long: true },
    ],
  },
  {
    title: "Footer — Contact",
    desc: "Email, phone, address and custom contact rows.",
    icon: Phone,
    fields: [
      { key: "site_footer_contact_title", label: "Column title" },
      { key: "site_contact_email", label: "Email" },
      { key: "site_contact_phone", label: "Phone / WhatsApp number" },
      { key: "site_contact_address", label: "Address" },
      {
        key: "site_footer_contact_items",
        label: "Custom contact rows — one per line: Label|Value|link|icon",
        hint: "Leave empty to auto-show Email / WhatsApp / Address from the fields above. Icons: mail, phone, whatsapp, map, telegram, clock. Example: Email Support|support@qorixlab.com|mailto:support@qorixlab.com|mail",
        long: true,
      },
    ],
  },
  {
    title: "Social & floating buttons",
    desc: "Social profiles, WhatsApp button and back-to-top.",
    icon: Share2,
    fields: [
      {
        key: "site_socials",
        label: "Socials — one per line: facebook|https://...",
        hint: "Supported names: facebook, instagram, telegram, twitter, whatsapp",
        long: true,
      },
      { key: "site_whatsapp", label: "Floating WhatsApp link (empty = hide)" },
      {
        key: "site_whatsapp_icon",
        label: "Floating WhatsApp button icon",
        hint: "Leave empty to show the built-in WhatsApp logo. Upload your own icon to use it instead (512×512 px PNG).",
        image: true,
      },
      { key: "site_show_scrolltop", label: "Show back-to-top button (1 = yes, 0 = no)" },
    ],
  },
  {
    title: "Copyright",
    desc: "Footer copyright line.",
    icon: Scale,
    fields: [
      { key: "site_copyright", label: "Copyright line ({year} = current year)", long: true },
    ],
  },
  {
    title: "About page",
    desc: "About page title, intro and feature cards.",
    icon: Info,
    fields: [
      { key: "site_page_about_title", label: "Page title ({brand} = brand name)" },
      { key: "site_page_about_body", label: "Intro text", long: true },
      {
        key: "site_page_about_points",
        label: "Feature cards — one per line: Title|Text",
        long: true,
      },
    ],
  },
  {
    title: "FAQ page",
    desc: "FAQ page heading and question list.",
    icon: HelpCircle,
    fields: [
      { key: "site_page_faq_title", label: "Page title" },
      { key: "site_page_faq_sub", label: "Subtitle" },
      {
        key: "site_page_faq_items",
        label: "Questions — one per line: Question|Answer",
        long: true,
      },
    ],
  },
  {
    title: "Contact page",
    desc: "Contact page heading and contact cards.",
    icon: MessageSquare,
    fields: [
      { key: "site_page_contact_title", label: "Page title" },
      { key: "site_page_contact_sub", label: "Subtitle" },
      {
        key: "site_page_contact_cards",
        label: "Cards — one per line: Title|Text|link|icon",
        hint: "link optional (https:// or /path). icon: telegram, chat, clock, track",
        long: true,
      },
    ],
  },
  {
    title: "Legal pages",
    desc: "Terms, Privacy and Refund policy text.",
    icon: Scale,
    fields: [
      { key: "site_page_terms_title", label: "Terms of Service — title" },
      { key: "site_page_terms_body", label: "Terms of Service — text (blank line = new paragraph)", long: true },
      { key: "site_page_privacy_title", label: "Privacy Policy — title" },
      { key: "site_page_privacy_body", label: "Privacy Policy — text", long: true },
      { key: "site_page_refund_title", label: "Refund Policy — title" },
      { key: "site_page_refund_body", label: "Refund Policy — text", long: true },
    ],
  },
];

function SitePage() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["bot-settings"], queryFn: () => getBotSettings() });
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const g of GROUPS) for (const f of g.fields) next[f.key] = data[f.key] ?? SITE_DEFAULTS[f.key] ?? "";
    setValues(next);
  }, [data]);

  const persist = async (payload: Record<string, string>, message: string) => {
    setSaving(true);
    try {
      await saveBotSettings({ data: { values: payload } });
      // Push the new content to every panel/page instantly
      await qc.invalidateQueries({ queryKey: ["site-content"] });
      broadcastSiteUpdate();
      toast.success(message);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const save = () => persist(values, "Website content saved");

  /* Uploads apply immediately — no need to press Save. */
  const saveImageNow = (key: string, url: string) => {
    const next = { ...values, [key]: url };
    setValues(next);
    void persist(next, url ? "Image live on the website" : "Image removed");
  };


  const resetDefaults = () => {
    const next = { ...values };
    for (const g of GROUPS) for (const f of g.fields) next[f.key] = SITE_DEFAULTS[f.key] ?? "";
    setValues(next);
    toast.info("Defaults loaded — press Save to apply");
  };

  return (
    <AdminShell
      title="Website content"
      subtitle="Everything on the public website — menu, footer, contact, copyright — is edited here."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetDefaults}>
            Load defaults
          </Button>
          <Button onClick={save} disabled={saving || isLoading}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      }
    >
      <SettingsHub
        sections={GROUPS.map<HubSection>((g) => ({
          id: g.title,
          title: g.title,
          description: g.desc,
          icon: g.icon,
          render: () => (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{g.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {g.fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={f.key}>{f.label}</Label>
                    {f.payments ? (
                      <PaymentsEditor
                        value={values[f.key] ?? ""}
                        onChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))}
                      />
                    ) : f.image ? (
                      <div className="space-y-2">
                        <ImageUploadField
                          value={values[f.key] ?? ""}
                          onChange={(url) => saveImageNow(f.key, url)}
                          placeholder="Image URL"
                          compact
                        />
                        {values[f.key] ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={values[f.key]}
                              alt=""
                              className="h-10 w-auto max-w-[160px] rounded border border-border/60 bg-muted/40 object-contain p-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => saveImageNow(f.key, "")}
                            >
                              Remove
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : f.long ? (
                      <Textarea
                        id={f.key}
                        rows={5}
                        value={values[f.key] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                    ) : (
                      <Input
                        id={f.key}
                        value={values[f.key] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                    )}
                    {f.hint ? <p className="text-xs text-muted-foreground">{f.hint}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ),
        }))}
      />
    </AdminShell>
  );
}

type PayRow = { label: string; bg: string; color: string; image: string };

function parseRows(value: string): PayRow[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = "", bg = "", color = "", image = ""] = line.split("|").map((p) => p.trim());
      return { label, bg, color, image };
    });
}

function serializeRows(rows: PayRow[]) {
  return rows
    .filter((r) => r.label || r.image)
    .map((r) => [r.label, r.bg, r.color, r.image].join("|").replace(/\|+$/, ""))
    .join("\n");
}

function PaymentsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const rows = parseRows(value);
  const update = (i: number, patch: Partial<PayRow>) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(serializeRows(next));
  };

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg border border-border/60 p-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-9 w-[86px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 px-2 text-[11px] font-bold"
              style={{ backgroundColor: r.bg || undefined, color: r.image ? undefined : r.color || "#fff" }}
            >
              {r.image ? (
                <img src={r.image} alt={r.label} className="max-h-6 w-auto object-contain" />
              ) : (
                r.label || "—"
              )}
            </span>
            <Input
              value={r.label}
              placeholder="Name (bKash)"
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <Input
              value={r.bg}
              placeholder="#background"
              className="w-32"
              onChange={(e) => update(i, { bg: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove payment method"
              onClick={() => onChange(serializeRows(rows.filter((_, idx) => idx !== i)))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2">
            <ImageUploadField
              value={r.image}
              onChange={(url) => update(i, { image: url })}
              placeholder="Logo URL (auto-filled on upload)"
              compact
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange(serializeRows([...rows, { label: "New method", bg: "", color: "", image: "" }]))}
      >
        <Plus className="mr-1 h-4 w-4" /> Add payment method
      </Button>
      <p className="text-xs text-muted-foreground">
        Logo size: <strong>200×60 px</strong> (transparent PNG) looks best.
      </p>
    </div>
  );
}
