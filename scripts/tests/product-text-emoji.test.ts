import { expect, test } from "bun:test";
import { messageToRich, renderRich } from "../../src/lib/bot/richtext";
test("premium emoji kept", () => {
  const r = messageToRich("Hi 🔥 there", [{ type: "custom_emoji", offset: 3, length: 2, custom_emoji_id: "5204116184986844054" }]);
  expect(r).toBe("Hi {ce:5204116184986844054:🔥} there");
  expect(renderRich(r)).toBe('Hi <tg-emoji emoji-id="5204116184986844054">🔥</tg-emoji> there');
});
