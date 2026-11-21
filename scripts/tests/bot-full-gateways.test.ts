import { expect, test } from "bun:test";
import { BOT_FULL_GATEWAYS_KEY, botFullGatewaysEnabled } from "../../src/lib/bot/full-gateways";

test("full bot gateways are active by default", () => expect(botFullGatewaysEnabled({})).toBe(true));
test("admin enabled setting restores full bot gateways", () => expect(botFullGatewaysEnabled({ [BOT_FULL_GATEWAYS_KEY]: "1" })).toBe(true));
test("admin disabled setting keeps restricted menus", () => expect(botFullGatewaysEnabled({ [BOT_FULL_GATEWAYS_KEY]: "0" })).toBe(false));

// Exercise the actual engine menu functions in isolation, without sending messages,
// creating orders or depending on live credentials.
const source = await Bun.file("src/lib/bot/engine.server.ts").text();
const transpiler = new Bun.Transpiler({ loader: "ts" });
function menuFunction(name: string, end: string, deps: Record<string, unknown>) {
  const start = source.indexOf(`async function ${name}(`);
  const finish = source.indexOf(end, start);
  if (start < 0 || finish <= start) throw new Error("Engine menu not found");
  const code = source.slice(start, finish).replace(/await import\("@\/lib\/(?:eps|oxapay|oxapay-settle)\.server"\)/g, "gatewayModules");
  return new Function(...Object.keys(deps), `${transpiler.transformSync(code)}; return ${name};`)(...Object.values(deps)) as (...args: unknown[]) => Promise<{kb: {callback_data?: string}[][]}>;
}
function dependencies(full: boolean, available = true) {
  const settings = { stars_enabled: "1" };
  return {
    getSettings: async () => settings, fullBotGateways: async () => full,
    sectionHead: (_s: unknown,_k: unknown,text: string) => text, pageIconHtml: () => "", money: (n: unknown) => `$${n}`,
    styled: (b: unknown) => b, uiBtn: (_s: unknown,_k: unknown,callback_data: string) => ({callback_data}),
    mfsBtn: (_s: unknown,_k: unknown,callback_data: string) => ({callback_data}), cardBtn: (_s: unknown,_k: unknown,callback_data: string) => ({callback_data}),
    websiteButtonRow: async () => [{url:"https://qorixlab.com/tg"}],
    starsEnabled: () => true, starsPerUsd: () => 77, usdToStars: () => 77,
    binanceConfig: async () => ({active:available,payid:available,crypto:available,live:true}),
    bybitSettings: async () => ({}), bybitEnabled: () => available,
    blockchainGateways: async () => [{network:"trc20",enabled:available,verified:true},{network:"bep20",enabled:available,verified:true}],
    gatewayModules: {epsConfig: () => ({enabled:available}), oxapayEnabled: () => available,oxapaySettings: async () => ({})},
    readCo: async () => ({items:[{product_id:"product",qty:2}]}), coTotals: async () => ({total:1,lines:[]}),
    getUser: async () => ({balance:10}), checkoutStockIssues: async () => [], telegramCheckoutDestination: () => "/checkout/product?quantity=2&stage=pay",
    uiIconHtml: () => "", escapeHtml: (s: unknown) => String(s), uiText: () => "", productIconHtml: () => "",
  };
}
for (const full of [true,false]) {
  test(`actual deposit menu ${full ? "restores all" : "hides extra"} gateways`, async () => {
    const menu = menuFunction("walletView", "const DEPOSIT_LABEL", dependencies(full));
    const {kb} = await menu({balance:10,total_spent:0,membership:"Bronze"},123);
    const callbacks = kb.flat().map(b => b.callback_data).filter(Boolean);
    expect(callbacks).toContain("dep:stars"); expect(callbacks).toContain("redeem"); expect(callbacks).toContain("hist:0"); expect(callbacks).toContain("home");
    for (const callback of ["dep:binance","dep:usdt","dep:bybit","dep:chain_trc20","dep:chain_bep20","dep:eps:mfs","dep:eps:card","dep:oxapay"]) expect(callbacks.includes(callback)).toBe(full);
    expect(kb[0]?.[0]).toHaveProperty("url","https://qorixlab.com/tg");
  });
  test(`actual checkout menu ${full ? "restores all" : "hides extra"} gateways`, async () => {
    const menu = menuFunction("coPayView", "/** Minutes an unpaid", dependencies(full));
    const {kb} = await menu(123,123); const callbacks = kb.flat().map(b => b.callback_data).filter(Boolean);
    expect(kb[0]?.[0]?.callback_data).toBe("copm:balance"); expect(callbacks).toContain("copm:stars"); expect(callbacks).toContain("co");
    for (const callback of ["copm:payid","copm:bybit","copm:chain_trc20","copm:chain_bep20","copm:BSC","copm:TRX","copm:oxapay","copm:eps_mfs","copm:eps_card"]) expect(callbacks.includes(callback)).toBe(full);
    expect(kb[1]?.[0]).toHaveProperty("url","https://qorixlab.com/tg");
  });
}
test("full menu never turns on an independently disabled checkout gateway", async () => {
  const menu = menuFunction("coPayView", "/** Minutes an unpaid", dependencies(true,false));
  const {kb} = await menu(123,123);
  expect(kb.flat().map(b=>b.callback_data).filter(Boolean)).toEqual(["copm:balance","copm:stars","co"]);
});
test("live switch read overrides cached settings immediately", async () => {
  const deps = {db:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{value:"0"},error:null})})})})},BOT_FULL_GATEWAYS_KEY,botFullGatewaysEnabled};
  const live = menuFunction("fullBotGateways","async function walletView",deps) as unknown as () => Promise<boolean>;
  expect(await live()).toBe(false);
});
