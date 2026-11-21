import { expect, mock, test } from "bun:test";
const settings: Record<string, string> = { admin_telegram_ids: "123" };
const user = { telegram_id: 123, state: { awaiting: "adm_icon", adm_product: "new-house-product" } as Record<string, unknown>, balance: 0, total_spent: 0 };
const product = { id: "new-house-product", name: "Test product", emoji: "📦", telegram_custom_emoji_id: null as string | null };
const prepared: string[] = [];
mock.module("@/lib/product-premium-sync.server", () => ({ syncProductPremiumIcon: async (id: string) => { prepared.push(id); }, reconcileProductPremiumIcons: async () => ({}) }));
mock.module("@/lib/bot/contact.server", () => ({ recordContact: async () => {} }));
mock.module("@/lib/bg.server", () => ({ backgroundWaitUntil: () => true }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    let key = "";
    const result = () => ({ data: table === "bot_settings" ? (key ? { value: settings[key] } : Object.entries(settings).map(([key,value]) => ({key,value}))) : table === "bot_users" ? user : table === "products" ? product : [], error: null });
    const chain: any = {
      select: () => chain, order: () => chain, range: () => chain, limit: () => chain,
      gt: () => chain, gte: () => chain, lt: () => chain, in: () => chain, or: () => chain, neq: () => chain, not: () => chain,
      eq: (field: string, value: string) => { if(field === "key") key=value; return chain; },
      update: (value: Record<string, unknown>) => {
        if(table === "bot_users" && value["state"]) user.state=value["state"] as Record<string, unknown>;
        if(table === "products") Object.assign(product,value);
        return chain;
      },
      upsert: () => chain, maybeSingle: async () => result(), single: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };return chain;
  },rpc: async () => ({data:null,error:null}),
} }));
const sent = async () => ({ok:true,result:{message_id:1}});
mock.module("@/lib/telegram.server", () => ({ answerCallback: sent, sendMessage: sent, editMessage: sent, styled: (b: object) => b, styleRows: (r: unknown) => r,
  deleteMessage: sent, getMe: sent, tg: sent, isCustomEmojiBlocked: () => false, sendDocument: sent, sendDocumentUpload: sent, sendAlertMessage: sent, sendPhoto: sent, sendAnimation: sent, COMMAND_LIST: [],
}));
const { handleUpdate } = await import("../../src/lib/bot/engine.server");
async function reply(sender: number, customId?: string) {
  await handleUpdate({message:{message_id:2,text:"📦",entities:customId ? [{type:"custom_emoji",offset:0,length:2,custom_emoji_id:customId}] : [],from:{id:sender,first_name:"Test"},chat:{id:sender,type:"private"}}});
}
test("authorized Bot Admin emoji save automatically prepares the new product website artwork", async () => {
  await reply(123,"5400280896311944960");
  expect(product.telegram_custom_emoji_id).toBe("5400280896311944960");
  expect(prepared).toEqual(["new-house-product"]);
});
test("normal emoji reset also synchronizes website fallback", async () => {
  user.state={awaiting:"adm_icon",adm_product:product.id};
  await reply(123);
  expect(product.telegram_custom_emoji_id).toBeNull();
  expect(prepared.length).toBe(2);
});
test("non-admin product icon input cannot trigger website artwork preparation", async () => {
  user.state={awaiting:"adm_icon",adm_product:product.id};
  await reply(456,"5400280896311944960");
  expect(prepared.length).toBe(2);
  expect(product.telegram_custom_emoji_id).toBeNull();
});