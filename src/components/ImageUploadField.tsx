import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_BYTES = 3 * 1024 * 1024;
/** Compress anything above this before upload so Telegram cards load fast. */
const TARGET_BYTES = 300 * 1024;

/**
 * Shrink an image to ≤ ~300KB, entirely in the browser (free, instant).
 * Keeps transparency via WebP. GIFs are left untouched to keep animation.
 */
async function compressImage(file: File): Promise<{ file: File; compressed: boolean }> {
  if (file.type === "image/gif" || file.size <= TARGET_BYTES) return { file, compressed: false };
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const MAX_DIM = 1600;
    if (Math.max(width, height) > MAX_DIM) {
      const scale = MAX_DIM / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, compressed: false };

    let best: Blob | null = null;
    for (let round = 0; round < 3; round++) {
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.85, 0.72, 0.6, 0.48, 0.36]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (!blob) break;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= TARGET_BYTES) {
          bitmap.close();
          const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
          return { file: new File([blob], name, { type: "image/webp" }), compressed: true };
        }
      }
      // Still too big — halve the dimensions and try again.
      width = Math.max(64, Math.round(width / 2));
      height = Math.max(64, Math.round(height / 2));
    }
    bitmap.close();
    if (best && best.size < file.size) {
      const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
      return { file: new File([best], name, { type: "image/webp" }), compressed: true };
    }
    return { file, compressed: false };
  } catch {
    return { file, compressed: false };
  }
}

type Props = {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  compact?: boolean;
};

export function ImageUploadField({ value, onChange, placeholder = "Image URL", compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(raw: File | undefined) {
    if (!raw) return;
    if (raw.size > MAX_BYTES) {
      toast.error("Image size must not exceed 3MB");
      return;
    }
    setBusy(true);
    try {
      const { file, compressed } = await compressImage(raw);
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
