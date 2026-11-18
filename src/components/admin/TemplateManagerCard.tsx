import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Monitor, Search, Smartphone } from "lucide-react";
import { getBotSettings, saveBotSettings } from "@/lib/admin.functions";
import { listStorefront } from "@/lib/shop.functions";
import { broadcastSiteUpdate } from "@/lib/site-refresh";
import {
  activeTemplate, MOBILE_IMAGES_KEY, MOBILE_LOGO_KEY, MOBILE_NAME_KEY, parseMobileImages, TEMPLATE_KEY,
  type SiteTemplate,
} from "@/lib/mobile-template";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImageUploadField } from "@/components/ImageUploadField";

const TEMPLATES: { id: SiteTemplate; name: string; desc: string; icon: typeof Monitor }[] = [
  { id: "basic", name: "Basic Template", desc: "The current website design — every page as it is today.", icon: Monitor },
  { id: "mobile", name: "Mobile View Template", desc: "The whole shop looks exactly like the QORIX Telegram bot.", icon: Smartphone },
];

/** Settings → Template Management: pick the live website design and manage Mobile View images. */
export function TemplateManagerCard() {
  const qc = useQueryClient();
  const load = useServerFn(getBotSettings);
  const save = useServerFn(saveBotSettings);
  const fetchStore = useServerFn(listStorefront);
  const { data: settings } = useQuery({ queryKey: ["admin-bot-settings-templates"], queryFn: () => load() });
  const { data: store } = useQuery({ queryKey: ["storefront"], queryFn: () => fetchStore() });

  const [active, setActive] = useState<SiteTemplate>("basic");
  const [logo, setLogo] = useState("");
  const [name, setName] = useState("");
  const [images, setImages] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setActive(activeTemplate(settings[TEMPLATE_KEY]));
    setLogo(settings[MOBILE_LOGO_KEY] ?? "");
    setName(settings[MOBILE_NAME_KEY] ?? "");
    setImages(parseMobileImages(settings[MOBILE_IMAGES_KEY]));
  }, [settings]);

  async function persist(values: Record<string, string>, ok: string) {
    setBusy(true);
    try {
      await save({ data: { values } });
      qc.invalidateQueries({ queryKey: ["site-content"] });
      qc.invalidateQueries({ queryKey: ["admin-bot-settings-templates"] });
      broadcastSiteUpdate();
      toast.success(ok);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const products = (store?.products ?? []) as any[];
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? products.filter((p) => String(p.name).toLowerCase().includes(t)) : products;
  }, [products, q]);
  const doneCount = products.filter((p) => images[p.id]).length;

  function setImage(id: string, url: string) {
    const next = { ...images };
    if (url) next[id] = url; else delete next[id];
    setImages(next);
    void persist({ [MOBILE_IMAGES_KEY]: JSON.stringify(next) }, url ? "Image saved" : "Image removed");
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {TEMPLATES.map((t) => {
            const on = active === t.id;
            const Icon = t.icon;
            return (
              <div key={t.id} className={`overflow-hidden rounded-xl border ${on ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
                  <p className="truncate text-lg font-bold">{t.name}</p>
                  <Button size="sm" variant={on ? "secondary" : "default"} disabled={busy || on}
                    className={on ? "" : "bg-success text-success-foreground hover:bg-success/90"}
                    onClick={() => { setActive(t.id); void persist({ [TEMPLATE_KEY]: t.id }, `${t.name} is now live`); }}>
                    {on ? <><CheckCircle2 className="mr-1 h-4 w-4" /> SELECTED</> : "SELECT"}
                  </Button>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                  <p className="text-sm text-muted-foreground">{t.desc}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mobile View — bot header</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Bot name shown at the top</Label>
            <Input value={name} placeholder="QORIX-store" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bot icon (round logo at the top)</Label>
            <ImageUploadField value={logo} onChange={setLogo} placeholder="Square image, 512×512 px" />
          </div>
          <Button disabled={busy} onClick={() => persist({ [MOBILE_NAME_KEY]: name.trim(), [MOBILE_LOGO_KEY]: logo.trim() }, "Bot header saved")}>
            Save header
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Mobile View — product images <Badge variant="secondary">{doneCount}/{products.length} uploaded</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            These images are used only by the Mobile View template. Products without one keep their normal image. Best size: square 256×256 px.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="pl-9" />
          </div>
          <div className="divide-y divide-border rounded-xl border border-border">
            {filtered.map((p) => (
              <div key={p.id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  {images[p.id] || p.image_url ? (
                    <img src={images[p.id] || p.image_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  ) : <span className="h-10 w-10 shrink-0 rounded-md bg-muted" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{images[p.id] ? "Mobile image set" : "Using normal image"}</p>
                  </div>
                </div>
                <ImageUploadField compact value={images[p.id] ?? ""} onChange={(url) => setImage(p.id, url)} />
              </div>
            ))}
            {filtered.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No products found.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
