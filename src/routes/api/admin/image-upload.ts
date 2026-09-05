import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const UPLOAD_BUCKET = "public-images";
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export const Route = createFileRoute("/api/admin/image-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) return Response.json({ error: "Please sign in again" }, { status: 401 });

        const supabaseUrl = process.env["SB_URL"] || process.env["SUPABASE_URL"];
        const publishableKey = process.env["SB_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !publishableKey) {
          return Response.json({ error: "Image storage is not configured" }, { status: 500 });
        }

        const supabase = createClient<Database>(supabaseUrl, publishableKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsError || !userId) return Response.json({ error: "Please sign in again" }, { status: 401 });

        const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });
        if (roleError || !isAdmin) return Response.json({ error: "Admin access required" }, { status: 403 });

        const form = await request.formData();
        const file = form.get("image");
        if (!(file instanceof File)) return Response.json({ error: "Choose an image first" }, { status: 400 });
        if (!ALLOWED_TYPES.has(file.type)) {
          return Response.json({ error: "Only PNG, JPG, WEBP or GIF images are allowed" }, { status: 400 });
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          return Response.json({ error: "Image size must not exceed 3MB" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
        const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from(UPLOAD_BUCKET)
          .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
        if (uploadError) {
          console.error("Image upload failed:", uploadError.message);
          return Response.json({ error: uploadError.message }, { status: 500 });
        }

        const publicUrl = supabaseAdmin.storage.from(UPLOAD_BUCKET).getPublicUrl(path).data.publicUrl;
        if (!publicUrl) return Response.json({ error: "Image URL could not be created" }, { status: 500 });
        return Response.json({ url: publicUrl });
      },
    },
  },
});