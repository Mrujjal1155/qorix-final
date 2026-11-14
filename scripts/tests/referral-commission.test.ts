import { beforeAll, afterAll, test, expect } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  adminNetProfit,
  buildReferralCommissionHistory,
  commissionExact,
  formatExactAmount,
  unitCostOf,
  walletCents,
  REFCOMM_PAGE_SIZE,
} from "../../src/lib/referral-commission";

const db = new PGlite();

const MIGRATION = new URL(
  "../../supabase/migrations/20261114195845_30dd0106-bdad-4f86-b403-945a4f62b30a.sql",
  import.meta.url,
);

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role' $$;

    CREATE TABLE bot_settings(key text PRIMARY KEY, value text, updated_at timestamptz DEFAULT now());
    CREATE TABLE profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text DEFAULT '', email text,
      wallet_balance numeric DEFAULT 0, referral_earnings numeric DEFAULT 0, referred_by uuid, is_banned boolean DEFAULT false,
      telegram_id bigint);
    CREATE TABLE bot_users(telegram_id bigint PRIMARY KEY, balance numeric DEFAULT 0, referral_earnings numeric DEFAULT 0,
      referred_by bigint, is_banned boolean DEFAULT false);
    CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no bigint, telegram_id bigint,
      product_id uuid, product_name text DEFAULT 'Product', quantity integer DEFAULT 1, total numeric DEFAULT 0,
      status text DEFAULT 'pending', source text DEFAULT 'bot', user_id uuid, customer_email text,
      meta jsonb DEFAULT '{}', referral_credited boolean DEFAULT false);
    CREATE TABLE referral_commissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, order_no bigint,
      channel text, referrer_user_id uuid, referrer_telegram_id bigint, buyer_user_id uuid, buyer_telegram_id bigint,
      percent numeric, amount numeric, reversed_amount numeric, status text, reason text,
      created_at timestamptz DEFAULT now(), reversed_at timestamptz);
    CREATE TABLE wallet_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, type text,
      amount numeric, balance_after numeric, reference text, note text, created_at timestamptz DEFAULT now());
    CREATE TABLE transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), telegram_id bigint, type text,
      amount numeric, method text, reference text, note text, created_at timestamptz DEFAULT now());

    CREATE FUNCTION referral_setting(_key text, _fallback text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT COALESCE(
        NULLIF((SELECT value FROM public.bot_settings WHERE key = _key), ''),
        NULLIF((SELECT value FROM public.bot_settings WHERE key = 'web_' || _key), ''),
        _fallback)
    $$;
  `);
  await db.exec(await readFile(MIGRATION, "utf8"));
}, 30000);

afterAll(async () => db.close());

/* ------------------------------------------------------- pure profit math */

test("net profit is the selling price minus the cost locked at purchase time", () => {
  expect(adminNetProfit({ total: 40, quantity: 1, meta: { unit_cost: 26 } })).toBe(14);
  expect(adminNetProfit({ total: 2.96, quantity: 2, meta: { unit_cost: 0.89 } })).toBeCloseTo(1.18, 10);
  expect(unitCostOf({ meta: { unit_cost: "0.89" } })).toBe(0.89);
});

test("an order with no recorded cost counts as full-price profit", () => {
  expect(adminNetProfit({ total: 12, quantity: 3, meta: {} })).toBe(12);
  expect(adminNetProfit({ total: 12, quantity: 3, meta: null })).toBe(12);
});

test("commission is 5% of profit and keeps small amounts exact", () => {
  expect(commissionExact(0.1, 5)).toBe(0.005);
  expect(commissionExact(0.2, 5)).toBe(0.01);
  expect(commissionExact(1, 5)).toBe(0.05);
  expect(commissionExact(5, 5)).toBe(0.25);
});

test("zero or negative profit earns nothing", () => {
  expect(commissionExact(0, 5)).toBe(0);
  expect(commissionExact(-3, 5)).toBe(0);
});

test("wallets receive whole cents while the ledger keeps the exact figure", () => {
  expect(walletCents(0.005)).toBe(0.01);
  expect(walletCents(0.004)).toBe(0);
  expect(walletCents(0.25)).toBe(0.25);
  expect(formatExactAmount(0.005)).toBe("$0.005");
  expect(formatExactAmount(0.0295)).toBe("$0.0295");
  expect(formatExactAmount(0.25)).toBe("$0.25");
  expect(formatExactAmount(0)).toBe("$0.00");
});

test("the history table shows product, profit, rate, commission, status and ids", () => {
  const html = buildReferralCommissionHistory(
    [
      {
        id: "aaaa1111-2222-3333-4444-555566667777",
        order_no: 3757,
        product_name: "Amazon Prime Video",
        admin_profit: 0.59,
        percent: 5,
        amount: 0.0295,
        wallet_amount: 0.03,
        status: "credited",
        created_at: "2026-11-14T19:50:00Z",
        buyer_telegram_id: 8770248088,
      },
    ],
    "REFERRAL COMMISSIONS",
    "Asia/Dhaka",
  );
  expect(html).toContain("Amazon Prime Video");
  expect(html).toContain("$0.0295");
  expect(html).toContain("$0.59");
  expect(html).toContain("5%");
  expect(html).toContain("Credited");
  expect(html).toContain("#3757");
  expect(html).toContain("8770248088");
  expect(html).toContain("aaaa1111");
});

test("an empty history says so instead of showing a blank page", () => {
  const html = buildReferralCommissionHistory([], "REFERRAL COMMISSIONS", "Asia/Dhaka");
  expect(html).toContain("No referral commissions yet");
});

/* --------------------------------------------------------- database rules */

async function balanceOf(telegramId: number) {
  const r = await db.query<any>(`SELECT balance FROM bot_users WHERE telegram_id=$1`, [telegramId]);
  return Number(r.rows[0]?.balance ?? 0);
}

async function makeOrder(fields: Partial<Record<string, unknown>> = {}) {
  const row = await db.query<any>(
    `INSERT INTO orders(order_no, telegram_id, product_name, quantity, total, status, source, meta)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      fields.order_no ?? Math.floor(Math.random() * 1e9),
      fields.telegram_id ?? 200,
      fields.product_name ?? "Netflix 1M",
      fields.quantity ?? 1,
      fields.total ?? 10,
      fields.status ?? "completed",
      fields.source ?? "bot",
      JSON.stringify(fields.meta ?? {}),
    ],
  );
  return row.rows[0].id as string;
}

test("the migration sets the default commission rate to 5%", async () => {
  const r = await db.query<any>(`SELECT value FROM bot_settings WHERE key='referral_percent'`);
  expect(r.rows[0]?.value).toBe("5");
});

test("a referred purchase pays 5% of profit into the referrer's wallet", async () => {
  await db.exec(`INSERT INTO bot_users(telegram_id,balance) VALUES(100,0),(200,0);
                 UPDATE bot_users SET referred_by=100 WHERE telegram_id=200;`);
  const id = await makeOrder({ telegram_id: 200, total: 10, quantity: 1, meta: { unit_cost: 6 } });
  const res = await db.query<any>(`SELECT referral_award($1) r`, [id]);
  expect(res.rows[0].r.ok).toBe(true);
  expect(Number(res.rows[0].r.profit)).toBe(4);
  expect(Number(res.rows[0].r.amount)).toBe(0.2);
  expect(await balanceOf(100)).toBe(0.2);
  const ledger = await db.query<any>(`SELECT amount, wallet_amount, admin_profit, product_name, status FROM referral_commissions WHERE order_id=$1`, [id]);
  expect(Number(ledger.rows[0].amount)).toBe(0.2);
  expect(Number(ledger.rows[0].wallet_amount)).toBe(0.2);
  expect(Number(ledger.rows[0].admin_profit)).toBe(4);
  expect(ledger.rows[0].product_name).toBe("Netflix 1M");
  expect(ledger.rows[0].status).toBe("credited");
});

test("the same order can never pay twice", async () => {
  const id = await makeOrder({ telegram_id: 200, total: 10, meta: { unit_cost: 6 } });
  const first = await db.query<any>(`SELECT referral_award($1) r`, [id]);
  const second = await db.query<any>(`SELECT referral_award($1) r`, [id]);
  expect(first.rows[0].r.ok).toBe(true);
  expect(second.rows[0].r.duplicate).toBe(true);
  const n = await db.query<any>(`SELECT count(*)::int n FROM referral_commissions WHERE order_id=$1`, [id]);
  expect(n.rows[0].n).toBe(1);
});

test("a sub-cent commission stays exact in the ledger and credits whole cents", async () => {
  await db.exec(`INSERT INTO bot_users(telegram_id,balance) VALUES(105,0),(205,0);
                 UPDATE bot_users SET referred_by=105 WHERE telegram_id=205;`);
  const id = await makeOrder({ telegram_id: 205, total: 0.1, quantity: 1, meta: { unit_cost: 0 } });
  const res = await db.query<any>(`SELECT referral_award($1) r`, [id]);
  expect(Number(res.rows[0].r.amount)).toBe(0.005);
  expect(Number(res.rows[0].r.credited)).toBe(0.01);
  expect(await balanceOf(105)).toBe(0.01);
});

test("zero or negative profit produces no credit", async () => {
  await db.exec(`INSERT INTO bot_users(telegram_id,balance) VALUES(106,0),(206,0);
                 UPDATE bot_users SET referred_by=106 WHERE telegram_id=206;`);
  const loss = await makeOrder({ telegram_id: 206, total: 5, quantity: 1, meta: { unit_cost: 8 } });
  const res = await db.query<any>(`SELECT referral_award($1) r`, [loss]);
  expect(res.rows[0].r.ok).toBe(false);
  expect(res.rows[0].r.reason).toBe("no_profit");
  expect(await balanceOf(106)).toBe(0);
  const row = await db.query<any>(`SELECT status, reason FROM referral_commissions WHERE order_id=$1`, [loss]);
  expect(row.rows[0].status).toBe("skipped");
  expect(row.rows[0].reason).toBe("no_profit");
});

test("a refund takes back exactly what was credited", async () => {
  await db.exec(`INSERT INTO bot_users(telegram_id,balance) VALUES(107,0),(207,0);
                 UPDATE bot_users SET referred_by=107 WHERE telegram_id=207;`);
  const id = await makeOrder({ telegram_id: 207, total: 0.1, quantity: 1, meta: { unit_cost: 0 } });
  await db.query(`SELECT referral_award($1)`, [id]);
  expect(await balanceOf(107)).toBe(0.01);
  const rev = await db.query<any>(`SELECT referral_reverse($1) r`, [id]);
  expect(Number(rev.rows[0].r.clawed_back)).toBe(0.01);
  expect(await balanceOf(107)).toBe(0);
  const row = await db.query<any>(`SELECT status, reversed_amount FROM referral_commissions WHERE order_id=$1`, [id]);
  expect(row.rows[0].status).toBe("reversed");
  expect(Number(row.rows[0].reversed_amount)).toBe(0.01);
});

test("commission history returns only the caller's rows, newest first, ten per page", async () => {
  await db.exec(`INSERT INTO bot_users(telegram_id,balance) VALUES(110,0),(210,0),(111,0),(211,0);
                 UPDATE bot_users SET referred_by=110 WHERE telegram_id=210;
                 UPDATE bot_users SET referred_by=111 WHERE telegram_id=211;`);
  for (let i = 0; i < 12; i++) {
    const id = await makeOrder({ telegram_id: 210, total: 10, quantity: 1, meta: { unit_cost: 5 } });
    await db.query(`SELECT referral_award($1)`, [id]);
  }
  const other = await makeOrder({ telegram_id: 211, total: 10, quantity: 1, meta: { unit_cost: 5 } });
  await db.query(`SELECT referral_award($1)`, [other]);

  const p0 = await db.query<any>(`SELECT referral_commission_history(110, 0) r`);
  expect(p0.rows[0].r.total).toBe(12);
  expect(p0.rows[0].r.rows.length).toBe(REFCOMM_PAGE_SIZE);
  const times = p0.rows[0].r.rows.map((x: any) => x.created_at);
  expect([...times].sort().reverse()).toEqual(times);

  const p1 = await db.query<any>(`SELECT referral_commission_history(110, 1) r`);
  expect(p1.rows[0].r.rows.length).toBe(2);

  const p2 = await db.query<any>(`SELECT referral_commission_history(110, 2) r`);
  expect(p2.rows[0].r.rows.length).toBe(0);

  const stranger = await db.query<any>(`SELECT referral_commission_history(111, 0) r`);
  expect(stranger.rows[0].r.total).toBe(1);
});
