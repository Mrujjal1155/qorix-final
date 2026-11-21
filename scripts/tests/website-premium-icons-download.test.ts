import { afterAll, expect, mock, test } from "bun:test";
import { gzipSync } from "node:zlib";
const id = "5400280896311944960";
let format = "image";
let path = "stickers/icon.webp";
let failed = false;
mock.module("@/lib/telegram.server", () => ({ tg: async (method: string) => method === "getCustomEmojiStickers"
  ? { ok: !failed, result: [{ custom_emoji_id: id, file_id: "file", is_animated: format === "lottie", is_video: format === "video" }] }
  : { ok: true, result: { file_path: path } } }));
const oldToken = process.env["TELEGRAM_BOT_TOKEN"];
process.env["TELEGRAM_BOT_TOKEN"] = "unit-test-token";
const oldFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = (async () => { requests++; return new Response(format === "lottie" ? gzipSync(JSON.stringify({ v: "5.12", layers: [] })) : new Uint8Array([1, 2, 3]), { status: 200 }); }) as typeof fetch;
afterAll(() => { globalThis.fetch = oldFetch; if (oldToken === undefined) delete process.env["TELEGRAM_BOT_TOKEN"]; else process.env["TELEGRAM_BOT_TOKEN"] = oldToken; });
const { downloadWebsiteEmoji } = await import("../../src/lib/website-premium-icons.server");
test("static and video artwork retains format without returning credentials or source URL", async () => {
  for (const [kind, extension] of [["image", "webp"], ["video", "webm"]]) {
    format = kind ?? "image"; path = `stickers/icon.${extension}`;
    const result = await downloadWebsiteEmoji(id);
    expect(result.kind).toBe(kind);
    expect(result.extension).toBe(extension);
    expect(JSON.stringify(result)).not.toContain("unit-test-token");
    expect(result).not.toHaveProperty("url");
  }
});
test("Telegram TGS is decoded into browser-readable Lottie JSON", async () => {
  format = "lottie"; path = "stickers/icon.tgs";
  const result = await downloadWebsiteEmoji(id);
  expect(result.kind).toBe("lottie");
  expect(JSON.parse(new TextDecoder().decode(result.bytes))).toEqual({ v: "5.12", layers: [] });
});
test("unknown emoji and unsafe file path cannot reach file download", async () => {
  const before = requests;
  failed = true;
  await expect(downloadWebsiteEmoji(id)).rejects.toThrow("Could not find");
  failed = false; path = "../private/icon.webp";
  await expect(downloadWebsiteEmoji(id)).rejects.toThrow("Could not prepare");
  expect(requests).toBe(before);
});