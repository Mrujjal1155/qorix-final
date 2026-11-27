import { beforeEach, expect, mock, test } from "bun:test";

let orders: any[] = [];
let profile: any;
let epsInit: any = null;
let oxaInvoice: any = null;
let providerPaid = true;
let credits = 0;
let settlements = 0;

const settings: Record<string, string> = {
  eps_enabled: "1", eps_username: "fixture", eps_password: "fixture", eps_hash_key: "fixture",
  eps_merchant_id: "fixture", eps_store_id: "fixture", bdt_rate: "125",
  oxapay_enabled: "1", oxapay_api_key: "fixture", bot_name: "QORIX",
};

function matches(row: any, filters: [string, unknown][]) {
  return filters.every(([key, value]) => row?.[key] === value);
}

mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    const filters: [string, unknown][] = [];
    let inserted: any = null;
    let patch: any = null;
    let countRequested = false;
    const query: any = {
      select: (_columns?: string, options?: { count?: string; head?: boolean }) => { countRequested = options?.count === "exact"; return query; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      in: () => query,
      insert: (value: any) => { inserted = value; return query; },
      update: (value: any) => { patch = value; return query; },
      maybeSingle: async () => execute(true),
      then: (resolve: any, reject: any) => execute(false).then(resolve, reject),
    };
    async function execute(single: boolean) {
      if (table === "profiles") return { data: single ? { ...profile } : [{ ...profile }], error: null };
      if (table === "bot_settings") return { data: Object.entries(settings).map(([key, value]) => ({ key, value })), error: null };
      if (table !== "orders") throw new Error(`Unexpected table: ${table}`);
      if (inserted) {
        const order = {
          id: `order-${orders.length + 1}`, order_no: 8100 + orders.length, created_at: new Date().toISOString(),
          delivered_content: null, reseller_id: null, ...structuredClone(inserted),
        };
        orders.push(order);
        return { data: single ? structuredClone(order) : [structuredClone(order)], error: null };
      }
      if (patch) {
        for (const order of orders) if (matches(order, filters)) Object.assign(order, structuredClone(patch));
        return { data: [], error: null };
      }
      const rows = orders.filter((order) => matches(order, filters));
      if (countRequested) return { count: rows.length, data: null, error: null };
      return { data: single ? (rows[0] ? structuredClone(rows[0]) : null) : structuredClone(rows), error: null };
    }
    return query;
  },
  async rpc(name: string, args: any) {
    const order = orders.find((row) => row.id === args._order_id);
    if (name === "settle_verified_website_payment") {
      if (!order || order.status !== "pending") return { data: null, error: { message: "closed" } };
      settlements++;
      order.meta = { ...order.meta, paid: true, awaiting_payment: false, [`${args._gateway}_paid`]: true };
      if (args._gateway === "eps") order.payment_method = "EPS · bKash";
      return { data: { changed: true }, error: null };
    }
    if (name === "claim_website_fulfillment") {
      if (!order || !order.meta.wallet_topup) return { data: { status: "ineligible" }, error: null };
      if (order.status === "credited") return { data: { status: "manual" }, error: null };
      if (order.status !== "pending" || !order.meta.paid) return { data: { status: "ineligible" }, error: null };
      order.status = "credited";
      profile.wallet_balance = Math.round((profile.wallet_balance + Number(order.total)) * 100) / 100;
      credits++;
      return { data: { status: "manual" }, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  },
} }));

mock.module("@/lib/site-url", () => ({ resolveSiteOrigin: () => "https://qorixlab.com" }));
mock.module("@/lib/eps.server", () => ({
  epsConfig: (raw: Record<string, string>) => ({ enabled: raw.eps_enabled === "1", rate: Number(raw.bdt_rate) }),
  usdToBdt: (usd: number, rate: number) => Math.round(usd * rate * 100) / 100,
  newMerchantTransactionId: () => "2026112709460001",
  initializePayment: async (_cfg: unknown, input: any) => {
    epsInit = structuredClone(input);
    return { ok: true, url: "https://gateway.example/eps", transactionId: "eps-init-1" };
  },
  isPaid: (status: string) => status === "Success",
  verifyTransaction: async (_cfg: unknown, ids: any) => {
    const order = orders.find((row) => row.txid === `EPS-${ids.merchantTransactionId}`);
    return { ok: true, info: { status: providerPaid ? "Success" : "Pending", amount: Number(order?.meta?.bdt ?? 0), epsTransactionId: "eps-provider-1", financialEntity: "bKash" } };
  },
}));
mock.module("@/lib/oxapay.server", () => ({
  oxapayEnabled: () => true,
  oxapayKey: () => "fixture",
  oxapayCreateInvoice: async (_key: string, input: any) => {
    oxaInvoice = structuredClone(input);
    return { ok: true, url: "https://gateway.example/oxapay", trackId: "oxa-track-1" };
  },
  oxapayPaymentInfo: async (_key: string, trackId: string) => {
    const order = orders.find((row) => row.meta?.oxapay_track_id === trackId);
    return { ok: true, info: { orderId: `W-${order?.id}`, trackId, status: providerPaid ? "paid" : "pending", currency: "USD", amount: Number(order?.total ?? 0), coin: "USDT", txHash: "fixture" } };
  },
}));
mock.module("@/lib/email/resend.server", () => ({ sendResendEmail: async () => {}, getEmailBrand: async () => ({ logoUrl: "" }) }));
mock.module("@/lib/email/templates", () => ({ orderReceiptEmail: () => ({ subject: "receipt", html: "receipt" }), adminNewOrderEmail: () => ({ subject: "admin", html: "admin" }) }));
mock.module("@/lib/order-access.server", () => ({ orderAccessToken: () => "fixture" }));

const { createEpsWalletTopup } = await import("../../src/lib/eps-checkout.server");
const { createOxapayWalletTopup } = await import("../../src/lib/oxapay-checkout.server");
const { settleEpsPayment } = await import("../../src/lib/eps-settle.server");
const { settleOxapay } = await import("../../src/lib/oxapay-settle.server");

beforeEach(() => {
  orders = [];
  profile = { id: "user-1", telegram_id: null, email: "buyer@example.com", full_name: "Buyer", is_banned: false, wallet_balance: 0 };
  epsInit = null; oxaInvoice = null; providerPaid = true; credits = 0; settlements = 0;
});

test("EPS wallet deposit creates the requested BDT payment and credits $10 exactly once", async () => {
  const created = await createEpsWalletTopup({ user_id: "user-1", amount: 10, customer_phone: "01712345678" });
  expect(created.amount_bdt).toBe(1250);
  expect(epsInit.amountBdt).toBe(1250);
  expect(epsInit.successUrl).toContain("wallet=1");
  expect(orders[0].product_id).toBeNull();
  expect(orders[0].meta.wallet_topup).toBe(true);

  expect((await settleEpsPayment("2026112709460001")).ok).toBe(true);
  expect(orders[0].status).toBe("credited");
  expect(profile.wallet_balance).toBe(10);
  await settleEpsPayment("2026112709460001");
  expect(credits).toBe(1);
  expect(settlements).toBe(1);
});

test("OxaPay wallet deposit uses the USD invoice and credits $12.50 exactly once", async () => {
  await createOxapayWalletTopup({ user_id: "user-1", amount: 12.5 });
  expect(oxaInvoice.amountUsd).toBe(12.5);
  expect(oxaInvoice.orderId).toBe("W-order-1");
  expect(orders[0].meta.wallet_topup).toBe(true);

  expect((await settleOxapay("oxa-track-1")).ok).toBe(true);
  expect(orders[0].status).toBe("credited");
  expect(profile.wallet_balance).toBe(12.5);
  await settleOxapay("oxa-track-1");
  expect(credits).toBe(1);
  expect(settlements).toBe(1);
});

test("an unconfirmed OxaPay invoice never credits the website wallet", async () => {
  await createOxapayWalletTopup({ user_id: "user-1", amount: 5 });
  providerPaid = false;
  expect((await settleOxapay("oxa-track-1")).ok).toBe(false);
  expect(orders[0].status).toBe("pending");
  expect(profile.wallet_balance).toBe(0);
  expect(credits).toBe(0);
});

test("Telegram-linked accounts cannot create a second website-wallet deposit", async () => {
  profile.telegram_id = 12345;
  await expect(createOxapayWalletTopup({ user_id: "user-1", amount: 5 })).rejects.toThrow("Telegram wallet is connected");
  expect(orders).toHaveLength(0);
  expect(oxaInvoice).toBeNull();
});

test("hosted wallet deposits reject amounts below $1", async () => {
  await expect(createEpsWalletTopup({ user_id: "user-1", amount: 0.5, customer_phone: "01712345678" })).rejects.toThrow("between 1 and 10000");
  expect(orders).toHaveLength(0);
  expect(epsInit).toBeNull();
});
