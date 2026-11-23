import { expect, test } from "bun:test";
import { websiteOrderRow } from "../../src/lib/bot/website-order-button";

const CONSENT_URL = "https://qorixlab.com/tg/one-time-consent-token";
const PREMIUM_ICON = "5278702045883292456";

const source = await Bun.file("src/lib/bot/engine.server.ts").text();
const transpiler = new Bun.Transpiler({ loader: "ts" });

/** Run the real homeKeyboard with mocked button helpers, sending nothing. */
function buildHomeKeyboard(hasWebsite: boolean) {
  const start = source.indexOf("async function homeKeyboard(");
  const finish = source.indexOf("async function homeText", start);
  if (start < 0 || finish <= start) throw new Error("homeKeyboard not found in engine source");
  const deps = {
    btnColor: () => "success" as const,
    styled: (b: Record<string, unknown>, style: string) => ({ ...b, style }),
    homeMenuColor: (_key: string, top: string) => top,
    iconButton: (_s: unknown, key: string, callback_data: string) => ({ text: key, callback_data }),
    iconUrlButton: (_s: unknown, key: string, url: string) => ({ text: key, url }),
    DEFAULT_EMAILS_LINK: "https://mailreader.click/",
    websiteButtonRow: async (_s: unknown, owner: number | null) =>
      owner
        ? websiteOrderRow({ text: "🌐 Buy on Website", url: CONSENT_URL, icon_custom_emoji_id: PREMIUM_ICON })
        : [],
  };
  const code = source.slice(start, finish);
  return new Function(
    ...Object.keys(deps),
    `${transpiler.transformSync(code)}; return homeKeyboard;`,
  )(...Object.values(deps)) as (
    settings: Record<string, string>,
    websiteOwner: number | null,
    user?: unknown,
  ) => Promise<Record<string, unknown>[][]>;
}

test("home menu starts with the blue website order button carrying its premium emoji", async () => {
  const kb = await buildHomeKeyboard(true)({}, 123, {});
  expect(kb[0]).toHaveLength(1);
  expect(kb[0][0]).toEqual({
    text: "🌐 Buy on Website",
    url: CONSENT_URL,
    style: "primary",
    icon_custom_emoji_id: PREMIUM_ICON,
  });
});

test("the menu buttons stay below the website button in their usual order", async () => {
  const kb = await buildHomeKeyboard(true)({}, 123, {});
  const callbacks = kb.flat().map((b) => b.callback_data).filter(Boolean);
  expect(callbacks).toEqual([
    "shop:0", "cart", "orders",
    "wallet", "freebies", "profile",
    "refstore",
    "support",
    "api", "clear",
    "ven:open",
  ]);
  expect(kb.flat().map((b) => b.url).filter(Boolean)).toEqual([CONSENT_URL, "https://mailreader.click/"]);
});

test("without a usable website link the home keyboard keeps no empty row", async () => {
  const kb = await buildHomeKeyboard(false)({}, null, {});
  expect(kb.every((row) => row.length > 0)).toBe(true);
  expect(kb.flat().some((b) => b.url === CONSENT_URL)).toBe(false);
  expect(kb[0][0].callback_data).toBe("shop:0");
});
