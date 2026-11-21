import { gunzipSync } from "node:zlib";
import { tg } from "@/lib/telegram.server";
import { websiteIconInput } from "@/lib/website-premium-icons";

const MAX_BYTES = 3 * 1024 * 1024;
type Sticker = { custom_emoji_id?: string; file_id?: string; is_animated?: boolean; is_video?: boolean; file_size?: number };

/** Fetch artwork server-side; Telegram credentials and file paths never reach the browser. */
export async function downloadWebsiteEmoji(emojiId: string) {
  const result = await tg("getCustomEmojiStickers", { custom_emoji_ids: [emojiId] });
  if (!result.ok || !Array.isArray(result.result)) throw new Error("Could not find this Premium emoji. Check the ID and try again.");
  const sticker = (result.result as Sticker[]).find(item => item.custom_emoji_id === emojiId);
  if (!sticker?.file_id || Number(sticker.file_size ?? 0) > MAX_BYTES) throw new Error("Premium emoji is unavailable or too large.");
  const file = await tg("getFile", { file_id: sticker.file_id });
  const path: unknown = file.result?.file_path;
  if (!file.ok || typeof path !== "string" || !/^[a-zA-Z0-9_/-]+\.(?:tgs|webm|webp)$/.test(path) || path.includes("..")) throw new Error("Could not prepare the Premium emoji artwork.");
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const connectionKey = process.env["TELEGRAM_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  let url: string;
  const headers = new Headers();
  if (token) url = `https://api.telegram.org/file/bot${token}/${path}`;
  else {
    if (!connectionKey || !lovableKey) throw new Error("Telegram connection is unavailable.");
    const gateway = (process.env["CONNECTOR_GATEWAY_BASE_URL"] ?? "https://connector-gateway.lovable.dev").replace(/\/$/, "");
    url = `${gateway}/telegram/file/${path}`;
    headers.set("Authorization", `Bearer ${lovableKey}`);
    headers.set("X-Connection-Api-Key", connectionKey);
  }
  let response: Response;
  try { response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error("Could not download the Premium emoji. Please try again."); }
  if (!response.ok) throw new Error(`Premium emoji download failed (${response.status}).`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("Premium emoji is too large.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("Premium emoji is too large.");
  if (sticker.is_animated) {
    const json = gunzipSync(bytes, { maxOutputLength: MAX_BYTES });
    JSON.parse(json.toString("utf8"));
    return { bytes: new Uint8Array(json), kind: "lottie" as const, extension: "json", contentType: "application/json" };
  }
  return sticker.is_video
    ? { bytes, kind: "video" as const, extension: "webm", contentType: "video/webm" }
    : { bytes, kind: "image" as const, extension: "webp", contentType: "image/webp" };
}

/** Call only after website-role or private Telegram admin verification. */
export async function prepareWebsiteIconRows(input: Record<string, string>) {
  const { values } = websiteIconInput.parse({ values: input });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const publicOrigin = new URL(import.meta.env["VITE_SUPABASE_URL"]).origin;
  if (!publicOrigin.endsWith(".supabase.co")) throw new Error("Public image storage is unavailable.");
  const resolved = new Map<string, string>();
  const rows: { key: string; value: string }[] = [];
  for (const [key, emojiId] of Object.entries(values)) {
    if (!emojiId) { rows.push({ key, value: "" }); continue; }
    let value = resolved.get(emojiId);
    if (!value) {
      const artwork = await downloadWebsiteEmoji(emojiId);
      const path = `website-premium/${emojiId}.${artwork.extension}`;
      const { error } = await supabaseAdmin.storage.from("public-images").upload(path, artwork.bytes, { contentType: artwork.contentType, upsert: false, cacheControl: "31536000" });
      if (error && !/already exists|duplicate/i.test(error.message)) throw new Error("Could not store the Premium emoji artwork.");
      value = JSON.stringify({ emojiId, kind: artwork.kind, url: `${publicOrigin}/storage/v1/object/public/public-images/${path}` });
      resolved.set(emojiId, value);
    }
    rows.push({ key, value });
  }
  return rows;
}