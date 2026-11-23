import { expect, test } from "bun:test";

const source = await Bun.file("src/lib/bot/engine.server.ts").text();
const transpiler = new Bun.Transpiler({ loader: "ts" });

type Sent = { text: string; keyboard?: unknown; extra?: unknown };

/** Run the real sayWithBottomMenu without sending anything. */
function runHomeSend() {
  const start = source.indexOf("async function sayWithBottomMenu(");
  const finish = source.indexOf("/** Page header icons", start);
  if (start < 0 || finish <= start) throw new Error("sayWithBottomMenu not found in engine source");
  const sent: Sent[] = [];
  const deps = {
    sendMessage: async (_c: number, text: string, keyboard?: unknown, extra?: unknown) => {
      sent.push({ text, keyboard, extra });
      return { result: { message_id: sent.length } };
    },
    defer: (fn: () => void) => { fn(); },
    trackMessage: async () => {},
    say: async (_c: number, text: string, kb?: unknown) => { sent.push({ text, keyboard: kb }); },
    uiTag: (_s: unknown, key: string) => key,
    bottomMenuMarkup: () => ({ keyboard: [[{ text: "Products" }]], resize_keyboard: true, is_persistent: true }),
  };
  const code = source.slice(start, finish);
  const fn = new Function(
    ...Object.keys(deps),
    `${transpiler.transformSync(code)}; return sayWithBottomMenu;`,
  )(...Object.values(deps)) as (
    chatId: number, text: string, settings: Record<string, string>, kb?: unknown,
  ) => Promise<unknown>;
  return { sent, send: () => fn(1, "<b>card</b>", {}, [[{ text: "SHOP", callback_data: "shop:0" }]]) };
}

test("the home menu no longer sends the heading and subtitle texts", async () => {
  const { sent, send } = runHomeSend();
  await send();
  expect(sent.some((m) => /QORIX STORE MENU|Shop • Wallet|Shop . Wallet/i.test(m.text))).toBe(false);
  expect(sent.some((m) => /home_menu_title|home_menu_subtitle/.test(m.text))).toBe(false);
});

test("the menu keyboard rides on a line with no visible characters", async () => {
  const { sent, send } = runHomeSend();
  await send();
  const menu = sent[sent.length - 1];
  expect(menu.text.replace(/[\u3164\s]/g, "")).toBe("");
  expect(/[A-Za-z0-9\u0980-\u09FF]/.test(menu.text)).toBe(false);
  expect(menu.keyboard).toEqual([[{ text: "SHOP", callback_data: "shop:0" }]]);
});

test("the welcome card still carries the persistent bottom menu", async () => {
  const { sent, send } = runHomeSend();
  await send();
  expect(sent[0].text).toBe("<b>card</b>");
  expect((sent[0].extra as { reply_markup: { is_persistent: boolean } }).reply_markup.is_persistent).toBe(true);
});
