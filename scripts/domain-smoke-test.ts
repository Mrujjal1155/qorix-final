/**
 * Domain smoke test.
 *   bun scripts/domain-smoke-test.ts [baseUrl]
 * Checks that every public page resolves and that all canonical/og:url/sitemap
 * links point at the canonical production domain.
 */
const BASE = (process.argv[2] ?? "http://localhost:8080").replace(/\/+$/, "");
const DOMAIN = "https://qorixlab.com";

const PAGES = [
  "/",
  "/store",
  "/about",
  "/contact",
  "/faq",
  "/terms",
  "/privacy",
  "/refund",
  "/reseller",
  "/reseller/docs",
];
const NOINDEX_PAGES = ["/auth", "/track", "/reseller/start"];

let failed = 0;
const ok = (name: string) => console.log(`  PASS  ${name}`);
const bad = (name: string, detail: string) => {
  failed++;
  console.log(`  FAIL  ${name} — ${detail}`);
};

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
  return { status: res.status, body: await res.text() };
}

async function checkPage(path: string, expectNoindex = false) {
  const { status, body } = await get(path);
  if (status !== 200) return bad(path, `status ${status}`);

  const canonical = body.match(/rel="canonical"\s+href="([^"]+)"/)?.[1];
  const ogUrl = body.match(/property="og:url"\s+content="([^"]+)"/)?.[1];
  const expected = `${DOMAIN}${path === "/" ? "/" : path}`;

  if (canonical !== expected) return bad(path, `canonical=${canonical ?? "missing"} (expected ${expected})`);
  if (ogUrl !== expected) return bad(path, `og:url=${ogUrl ?? "missing"} (expected ${expected})`);
  if (expectNoindex && !/name="robots"\s+content="noindex/.test(body)) return bad(path, "missing noindex");
  ok(path);
}

async function checkSitemap() {
  const { status, body } = await get("/sitemap.xml");
  if (status !== 200) return bad("/sitemap.xml", `status ${status}`);
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  if (locs.length === 0) return bad("/sitemap.xml", "no <loc> entries");
  const wrong = locs.filter((l) => !l.startsWith(`${DOMAIN}/`));
  if (wrong.length) return bad("/sitemap.xml", `${wrong.length} url(s) off-domain, e.g. ${wrong[0]}`);
  ok(`/sitemap.xml (${locs.length} urls)`);
}

async function checkRobots() {
  const { status, body } = await get("/robots.txt");
  if (status !== 200) return bad("/robots.txt", `status ${status}`);
  if (!body.includes(`Sitemap: ${DOMAIN}/sitemap.xml`)) return bad("/robots.txt", "missing Sitemap directive");
  for (const p of ["/admin", "/account", "/reseller/panel"]) {
    if (!body.includes(`Disallow: ${p}`)) return bad("/robots.txt", `missing Disallow ${p}`);
  }
  ok("/robots.txt");
}

async function checkResellerApiBase() {
  // The docs show an environment-aware base: production domain when live,
  // the current origin when running locally.
  const { body } = await get("/reseller/docs");
  const expected = `${BASE === DOMAIN ? DOMAIN : BASE}/api/public/reseller/v1`;
  if (!body.includes(expected)) {
    return bad("/reseller/docs api base", `docs do not show ${expected}`);
  }
  ok(`/reseller/docs api base (${expected})`);
}

console.log(`Domain smoke test against ${BASE}\n`);
for (const p of PAGES) await checkPage(p);
for (const p of NOINDEX_PAGES) await checkPage(p, true);
await checkSitemap();
await checkRobots();
await checkResellerApiBase();

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
