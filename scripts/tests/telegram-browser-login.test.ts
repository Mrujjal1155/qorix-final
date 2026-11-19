import { test, expect } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

test("two browser authorizations can independently claim the same Telegram account once", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
    await db.exec(await readFile(new URL("../../supabase/migrations/20261118145211_3ff7a53e-3cd8-43c0-bf7e-841fb3e349ef.sql", import.meta.url), "utf8"));
    await db.exec("INSERT INTO web_login_codes(code,secret_hash) VALUES ('browser1','secret1'),('browser2','secret2');");
    for (const n of [1, 2]) {
      const confirmed = await db.query<{r:string}>("SELECT confirm_web_login_code($1,12345) r", [`browser${n}`]);
      expect(confirmed.rows[0]?.r).toBe("ok");
      const claimed = await db.query<{r:number}>("SELECT claim_web_login_code($1,$2) r", [`browser${n}`, `secret${n}`]);
      expect(Number(claimed.rows[0]?.r)).toBe(12345);
      const repeat = await db.query<{r:null}>("SELECT claim_web_login_code($1,$2) r", [`browser${n}`, `secret${n}`]);
      expect(repeat.rows[0]?.r).toBeNull();
    }
  } finally { await db.close(); }
}, 30000);