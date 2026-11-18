import { useEffect, useMemo, useState } from "react";
import { stripEmoji } from "@/lib/mobile-template";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, ImageIcon, LayoutGrid, Monitor, Search, Smartphone } from "lucide-react";
import { getBotSettings, getCatalogue, saveBotSettings } from "@/lib/admin.functions";
import { broadcastSiteUpdate } from "@/lib/site-refresh";
import {
  activeTemplate, MOBILE_CAT_IMAGES_KEY, MOBILE_IMAGES_KEY, MOBILE_LOGO_KEY, MOBILE_NAME_KEY, parseMobileImages, TEMPLATE_KEY,
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
  const fetchCatalogue = useServerFn(getCatalogue);
  const { data: settings } = useQuery({ queryKey: ["admin-bot-settings-templates"], queryFn: () => load() });
  const { data: catalogue } = useQuery({ queryKey: ["admin-template-catalogue"], queryFn: () => fetchCatalogue() });

  const [active, setActive] = useState<SiteTemplate>("basic");
  const [logo, setLogo] = useState("");
  const [name, setName] = useState("");
  const [images, setImages] = useState<Record<string, string>>({});
  const [catImages, setCatImages] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<"products" | "categories" | null>(null);
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setActive(activeTemplate(settings[TEMPLATE_KEY]));
    setLogo(settings[MOBILE_LOGO_KEY] ?? "");
    setName(settings[MOBILE_NAME_KEY] ?? "");
    setImages(parseMobileImages(settings[MOBILE_IMAGES_KEY]));
    setCatImages(parseMobileImages(settings[MOBILE_CAT_IMAGES_KEY]));
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

  const allProducts = ((catalogue as any)?.products ?? []) as any[];
  const allCategories = ((catalogue as any)?.categories ?? []) as any[];

  function setMapImage(key: string, map: Record<string, string>, set: (m: Record<string, string>) => void, id: string, url: string) {
    const next = { ...map };
    if (url) next[id] = url; else delete next[id];
    set(next);
    void persist({ [key]: JSON.stringify(next) }, url ? "Image saved" : "Image removed");
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
        <CardHeader><CardTitle>Mobile View — images</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button variant={panel === "products" ? "default" : "outline"} onClick={() => setPanel(panel === "products" ? null : "products")}>
              <ImageIcon className="mr-2 h-4 w-4" /> Product Image
            </Button>
            <Button variant={panel === "categories" ? "default" : "outline"} onClick={() => setPanel(panel === "categories" ? null : "categories")}>
              <LayoutGrid className="mr-2 h-4 w-4" /> Category Image
            </Button>
          </div>
          {panel === "products" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant={status === "active" ? "secondary" : "ghost"} onClick={() => setStatus("active")}>
                  Active ({allProducts.filter((p) => p.is_active).length})
                </Button>
                <Button size="sm" variant={status === "inactive" ? "secondary" : "ghost"} onClick={() => setStatus("inactive")}>
                  Inactive ({allProducts.filter((p) => !p.is_active).length})
                </Button>
              </div>
              <ImageList rows={allProducts.filter((p) => (status === "active" ? p.is_active : !p.is_active))}
                map={images} onSet={(id, url) => setMapImage(MOBILE_IMAGES_KEY, images, setImages, id, url)} />
            </>
          )}
          {panel === "categories" && (
            <ImageList rows={allCategories} map={catImages}
              onSet={(id, url) => setMapImage(MOBILE_CAT_IMAGES_KEY, catImages, setCatImages, id, url)} />
          )}
          <p className="text-xs text-muted-foreground">Used only by the Mobile View template. Best size: square 256×256 px. Without an upload the normal image stays.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ImageList({ rows, map, onSet }: { rows: any[]; map: Record<string, string>; onSet: (id: string, url: string) => void }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => String(r.name).toLowerCase().includes(t)) : rows;
  }, [rows, q]);
  const done = rows.filter((r) => map[r.id]).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
        </div>
        <Badge variant="secondary">{done}/{rows.length} uploaded</Badge>
      </div>
      <div className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {filtered.map((r) => (
          <div key={r.id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              {map[r.id] || r.image_url ? (
                <img src={map[r.id] || r.image_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
              ) : <span className="h-10 w-10 shrink-0 rounded-md bg-muted" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{stripEmoji(r.name)}</p>
                <p className="text-xs text-muted-foreground">{map[r.id] ? "Mobile image set" : "Using normal image"}</p>
              </div>
            </div>
            <ImageUploadField compact value={map[r.id] ?? ""} onChange={(url) => onSet(r.id, url)} />
          </div>
        ))}
        {filtered.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nothing found.</p>}
      </div>
    </div>
  );
}
