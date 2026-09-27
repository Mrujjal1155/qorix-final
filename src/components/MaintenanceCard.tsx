import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ImageUploadField } from "@/components/ImageUploadField";
import maintenanceImg from "@/assets/maintenance.jpg";

/** Website and bot maintenance — two fully separate switches. */
export function MaintenanceCard({
  values,
  setValues,
  onSave,
}: {
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  onSave: () => void;
}) {
  const isOn = (k: string) => (values[k] ?? "").toLowerCase() === "on";
  const set = (k: string, val: string) => setValues({ ...values, [k]: val });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance mode</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base">Website maintenance</Label>
              <p className="text-xs text-muted-foreground">
                Visitors see the maintenance screen. Admin panel and signed-in admins stay open. The bot is not affected.
              </p>
            </div>
            <Switch checked={isOn("site_maintenance")} onCheckedChange={(c) => set("site_maintenance", c ? "on" : "")} />
          </div>
          <div className="space-y-1.5">
            <Label>Website message</Label>
            <Textarea
              rows={3}
              placeholder="We're upgrading the store to serve you better. Please check back shortly."
              value={values["site_maintenance_message"] ?? ""}
              onChange={(e) => set("site_maintenance_message", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Maintenance image (optional)</Label>
            <ImageUploadField
              value={values["site_maintenance_image"] ?? ""}
              onChange={(url) => set("site_maintenance_image", url)}
              placeholder="Image URL — empty uses the default image"
              compact
            />
            <div className="flex items-center gap-2">
              <img
                src={values["site_maintenance_image"] || maintenanceImg}
                alt="Maintenance preview"
                className="h-24 w-auto rounded border border-border/60 object-cover"
              />
              {values["site_maintenance_image"] ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => set("site_maintenance_image", "")}>
                  Use default
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-border/70 pt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base">Bot maintenance</Label>
              <p className="text-xs text-muted-foreground">
                Bot users get the notice below instead of the menu. Bot admins can still use the bot. The website is not affected.
              </p>
            </div>
            <Switch checked={isOn("bot_maintenance")} onCheckedChange={(c) => set("bot_maintenance", c ? "on" : "")} />
          </div>
          <div className="space-y-1.5">
            <Label>Bot message</Label>
            <Textarea
              rows={3}
              placeholder="🛠 The bot is under maintenance right now. Please try again a little later."
              value={values["bot_maintenance_message"] ?? ""}
              onChange={(e) => set("bot_maintenance_message", e.target.value)}
            />
          </div>
        </section>

        <Button onClick={onSave}>Save maintenance settings</Button>
      </CardContent>
    </Card>
  );
}
