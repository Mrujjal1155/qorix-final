import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_BYTES = 3 * 1024 * 1024;

type Props = {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  compact?: boolean;
};

export function ImageUploadField({ value, onChange, placeholder = "Image URL", compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Image size must not exceed 3MB");
      return;
    }
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Please sign in again");

      const form = new FormData();
      form.append("image", file);
      const response = await fetch("/api/admin/image-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const result = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Upload failed");
      if (!result?.url) throw new Error("Upload completed but no image URL was returned");
      onChange(result.url);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon" : "default"}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-label="Upload image"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {!compact && <span className="ml-1">Upload</span>}
        </Button>
      </div>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Best size: for hero/icon cards <strong>512×512 px (1:1)</strong>, for product banners{" "}
          <strong>1200×900 px (4:3)</strong>. Formats PNG / JPG / WEBP, max file size <strong>3MB</strong> (ideal
          200–500KB)।
        </p>
      )}
    </div>
  );
}
