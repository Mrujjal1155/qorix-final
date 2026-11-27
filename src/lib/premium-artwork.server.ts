import { gunzipSync } from "node:zlib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { downloadWebsiteEmoji } from "@/lib/website-premium-icons.server";

const inFlight = new Map<string, Promise<string>>();

/** Immutable public artwork, shared by emoji ID; never store Telegram URLs. */
export async function artworkFor(emojiId: string): Promise<string> {
  const existing = inFlight.get(emojiId);
  if (existing) return existing;
  const job = (async () => {
    const origin = new URL(process.env["SB_URL"] ?? process.env["SUPABASE_URL"] ?? "").origin;
    if (!origin.endsWith(".supabase.co")) throw new Error("Public artwork storage unavailable");
    const bucket = supabaseAdmin.storage.from("public-images");
    const { data: files, error: listError } = await bucket.list("website-premium", { search: `${emojiId}.`, limit: 3 });
    if (listError) throw new Error("Could not read public artwork");
    const stored = files?.find(file => ["webp", "webm", "json"].some(ext => file.name === `${emojiId}.${ext}`));
    let extension = stored?.name.split(".").pop();
    if (!extension) {
      const artwork = await downloadWebsiteEmoji(emojiId);
      extension = artwork.extension;
      const { error } = await bucket.upload(`website-premium/${emojiId}.${extension}`, artwork.bytes, {
        contentType: artwork.contentType, upsert: false, cacheControl: "31536000",
      });
      if (error && !/already exists|duplicate/i.test(error.message)) throw new Error("Could not store public artwork");
    }
    return JSON.stringify({ emojiId, kind: extension === "json" ? "lottie" : extension === "webm" ? "video" : "image",
      url: `${origin}/storage/v1/object/public/public-images/website-premium/${emojiId}.${extension}` });
  })();
  // Bound concurrent deduplication state; entries disappear on success or failure.
  if (inFlight.size < 32) inFlight.set(emojiId, job);
  try { return await job; } finally { if (inFlight.get(emojiId) === job) inFlight.delete(emojiId); }
}
