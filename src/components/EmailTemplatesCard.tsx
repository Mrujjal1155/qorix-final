import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { previewEmailTemplate } from "@/lib/admin.functions";
import { EMAIL_TEMPLATE_CATALOG, type EmailTemplateMeta } from "@/lib/email/preview-catalog";

/**
 * Admin list of every email the app sends, each with a rendered preview so the
 * admin can see the exact design and the fields that go out.
 */
export function EmailTemplatesCard() {
  const render = useServerFn(previewEmailTemplate);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<EmailTemplateMeta | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  async function onPreview(tpl: EmailTemplateMeta) {
    setLoadingId(tpl.id);
    try {
      const r = await render({ data: { id: tpl.id } });
      setActive(tpl);
      setPreview({ subject: r.subject, html: r.html });
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Email templates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Every email this website sends, with who receives it and what it contains. Press Preview to
            see the exact design with sample data.
          </p>

          <div className="divide-y rounded-lg border">
            {EMAIL_TEMPLATE_CATALOG.map((tpl) => (
              <div key={tpl.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{tpl.label}</span>
                    <Badge variant="secondary">{tpl.recipient}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground/80">When: </span>
                    {tpl.trigger}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground/80">Includes: </span>
                    {tpl.contains}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onPreview(tpl)}
                  disabled={loadingId === tpl.id}
                >
                  {loadingId === tpl.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="mr-2 h-4 w-4" />
                  )}
                  Preview
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{active?.label ?? "Email preview"}</DialogTitle>
          </DialogHeader>
          {preview ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">To: </span>
                  {active?.recipient}
                </div>
                <div className="break-words">
                  <span className="text-muted-foreground">Subject: </span>
                  <span className="font-medium">{preview.subject}</span>
                </div>
              </div>
              <iframe
                title="Email preview"
                srcDoc={preview.html}
                sandbox=""
                className="h-[60vh] w-full rounded-md border bg-white"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
