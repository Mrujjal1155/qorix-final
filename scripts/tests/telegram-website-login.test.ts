import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { loginCodeAvailable, parseTelegramLoginFragment, telegramWebsiteLoginUrl, telegramWebsiteDestination, telegramCheckoutDestination } from "../../src/lib/telegram-website-login";
import { issueTelegramWebsiteLogin, previewTelegramWebsiteLogin, telegramLoginHash } from "../../src/lib/telegram-website-login.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const code = "a".repeat(24), secret = "b".repeat(48);

test("quantity handoff preserves the product and selected quantity of 5", () => {
  const next = "/store/gemini-plus-6-months?stage=quantity&qty=5";
  expect(telegramWebsiteDestination(next)).toBe(next);
  expect(new URL(telegramWebsiteLoginUrl("https://qorixlab.com", code, secret, next)).searchParams.get("next")).toBe(next);
});

test("checkout handoff retains quantity 5 without going back to product selection", () => {
  expect(telegramCheckoutDestination([{ product_id: "p1", qty: 5 }], "details")).toBe("/checkout?id=p1&qty=5&step=details");
});

test("payment-method handoff retains the same product and quantity 10", () => {
  expect(telegramCheckoutDestination([{ product_id: "p1", qty: 10 }], "pay")).toBe("/checkout?id=p1&qty=10&step=pay");
});

test("handoffs reject forged paths, extra payment instructions and invalid quantities", () => {
  for (const next of ["/checkout?id=p1&qty=0&step=pay", "/checkout?id=p1&qty=100001&step=pay", "/checkout?id=p1&qty=1.5&step=pay", "/checkout?id=p1&qty=1&step=pay&paid=true", "/checkout?id=../admin&qty=1&step=pay", "/store/p1?stage=quantity&qty=100001"]) expect(telegramWebsiteDestination(next)).toBe("/");
  expect(telegramCheckoutDestination([{ product_id: "p1", qty: 1 }, { product_id: "p2", qty: 2 }], "pay")).toBe("/store");
});

test("website link goes directly to HTTPS website consent, with credential outside query/path", () => {
  const url = new URL(telegramWebsiteLoginUrl("https://qorixlab.com", code, secret));
  expect(url.origin).toBe("https://qorixlab.com");
  expect(url.pathname).toBe("/tg");
  expect(url.search).toBe("");
  expect(parseTelegramLoginFragment(url.hash)).toEqual({ code, secret });
  expect(() => telegramWebsiteLoginUrl("http://qorixlab.com", code, secret)).toThrow();
});

test("username-only, malformed and extra-token links never authorize", () => {
  for (const fragment of ["#@tester", `#${code}.${secret}.extra`, `#${code}.${secret.toUpperCase()}`, ""]) {
    expect(parseTelegramLoginFragment(fragment)).toBeNull();
  }
});

test("deposit links still require the same consent and carry only an allowlisted wallet destination", async () => {
  const fixture = databaseFixture();
  const url = new URL(await issueTelegramWebsiteLogin(fixture.db, 12345, "https://qorixlab.com", "/account?deposit=1"));
  expect(url.pathname).toBe("/tg");
  expect(url.searchParams.get("next")).toBe("/account?deposit=1");
  const credentials = parseTelegramLoginFragment(url.hash);
  if (!credentials) throw new Error("Missing consent credentials");
  expect(await previewTelegramWebsiteLogin(fixture.db, credentials)).toEqual({ status: "ok", name: "@tester" });
  expect(telegramWebsiteDestination(url.searchParams.get("next"))).toBe("/account?deposit=1");
  expect(fixture.rows[0]?.["claimed_at"]).toBeNull();
});

test("post-connect routing rejects external, protocol-relative and unknown destinations", () => {
  for (const destination of [null, "https://attacker.example", "//attacker.example", "/admin", "/account?next=https://attacker.example", "/account/../admin", "/store/../admin", "/store/%2fadmin", "/store/product?next=https://attacker.example", "/store/product#secret", "/store/" + "a".repeat(241)]) {
    expect(telegramWebsiteDestination(destination)).toBe("/");
  }
  expect(telegramWebsiteDestination("/account")).toBe("/account");
});

test("product consent preserves the exact selected product URL without claiming or purchasing", async () => {
  const fixture = databaseFixture();
  const next = "/store/gemini-plus-6-months";
  const url = new URL(await issueTelegramWebsiteLogin(fixture.db, 12345, "https://qorixlab.com", next));
  expect(url.pathname).toBe("/tg");
  expect(telegramWebsiteDestination(url.searchParams.get("next"))).toBe(next);
  const credentials = parseTelegramLoginFragment(url.hash);
  if (!credentials) throw new Error("Missing consent credentials");
  expect(await previewTelegramWebsiteLogin(fixture.db, credentials)).toEqual({ status: "ok", name: "@tester" });
  expect(fixture.rows[0]?.["claimed_at"]).toBeNull();
  expect(new Set(fixture.tables)).toEqual(new Set(["bot_users", "web_login_codes"]));
});

test("10-minute absolute expiry, no preview after claim, and confirmation required", () => {
  const now = Date.parse("2026-11-21T04:40:00Z");
  const row = { confirmed_at: new Date(now).toISOString(), claimed_at: null, expires_at: new Date(now + 600_000).toISOString() };
  expect(loginCodeAvailable(row, now + 599_999)).toBe(true);
  expect(loginCodeAvailable(row, now + 600_000)).toBe(false);
  expect(loginCodeAvailable({ ...row, claimed_at: new Date(now).toISOString() }, now)).toBe(false);
  expect(loginCodeAvailable({ ...row, confirmed_at: null }, now)).toBe(false);
});

function databaseFixture() {
  const rows: Array<Record<string, any>> = [];
  const user = { telegram_id: 12345, is_banned: false, username: "tester", first_name: "Test" };
  const tables: string[] = [];
  const db = {
    from(table: string) {
      tables.push(table);
      const filters: Record<string, unknown> = {};
      const chain: any = {
        select: () => chain,
        eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
        insert: async (row: Record<string, any>) => { rows.push({ ...row, claimed_at: null }); return { error: null }; },
        maybeSingle: async () => ({ data: table === "bot_users" ? user : rows.find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { db, rows, user, tables };
}

test("bot-issued link binds numeric identity, stores only hash and leaves wallet/orders/profiles untouched", async () => {
  const fixture = databaseFixture();
  const url = await issueTelegramWebsiteLogin(fixture.db, 12345, "https://qorixlab.com");
  const credentials = parseTelegramLoginFragment(new URL(url).hash);
  expect(credentials).not.toBeNull();
  if (!credentials) throw new Error("Missing credentials");
  const row = fixture.rows[0];
  expect(row?.["telegram_id"]).toBe(12345);
  expect(row?.["secret_hash"]).toBe(await telegramLoginHash(credentials.secret));
  expect(JSON.stringify(fixture.rows)).not.toContain(credentials.secret);
  expect(Date.parse(row?.["expires_at"]) - Date.parse(row?.["confirmed_at"])).toBe(600_000);
  expect(await previewTelegramWebsiteLogin(fixture.db, credentials)).toEqual({ status: "ok", name: "@tester" });
  expect(new Set(fixture.tables)).toEqual(new Set(["bot_users", "web_login_codes"]));
  expect(await previewTelegramWebsiteLogin(fixture.db, { ...credentials, secret: "c".repeat(48) })).toEqual({ status: "invalid" });
  fixture.user.is_banned = true;
  expect(await previewTelegramWebsiteLogin(fixture.db, credentials)).toEqual({ status: "invalid" });
  await expect(issueTelegramWebsiteLogin(fixture.db, 12345, "https://qorixlab.com")).rejects.toThrow();
});

test("same Telegram account gets independent links across browsers, without profile reassignment", async () => {
  const fixture = databaseFixture();
  const first = await issueTelegramWebsiteLogin(fixture.db, 12345, "https://qorixlab.com");
  const second = await issueTelegramWebsiteLogin(fixture.db, 12345, "https://qorixlab.com");
  expect(first).not.toBe(second);
  expect(fixture.rows.map(row => row["telegram_id"])).toEqual([12345, 12345]);
});

test("database claim is single-use, secret-bound, absolutely expired and service-only", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
    await db.exec(await readFile(new URL("../../supabase/migrations/20261118145211_3ff7a53e-3cd8-43c0-bf7e-841fb3e349ef.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../supabase/migrations/20261121044300_cd540d9b-ff2e-45ae-ac79-3649d4dd592d.sql", import.meta.url), "utf8"));
    await db.exec("INSERT INTO web_login_codes(code,secret_hash,telegram_id,confirmed_at,expires_at) VALUES ('fresh','hash',12345,now(),now()+interval '10 minutes'),('old','hash',12345,now(),now()-interval '1 second');");
    const query = async (code: string, hash: string) => (await db.query<{ tid: number | null }>("SELECT claim_web_login_code($1,$2) AS tid", [code, hash])).rows[0]?.tid;
    expect(await query("fresh", "wrong")).toBeNull();
    expect(Number(await query("fresh", "hash"))).toBe(12345);
    expect(await query("fresh", "hash")).toBeNull();
    expect(await query("old", "hash")).toBeNull();
    const permissions = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>("SELECT has_function_privilege('anon','claim_web_login_code(text,text)','EXECUTE') AS anon, has_function_privilege('authenticated','claim_web_login_code(text,text)','EXECUTE') AS authenticated, has_function_privilege('service_role','claim_web_login_code(text,text)','EXECUTE') AS service");
    expect(permissions.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  } finally { await db.close(); }
}, 30_000);