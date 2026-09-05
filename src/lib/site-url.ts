/**
 * Environment-aware public site URL.
 *
 * Resolution order (first match wins):
 *  1. `VITE_SITE_URL` — explicit override, works on client and server.
 *  2. `SITE_URL` (server-only env var) — for staging/production deployments.
 *  3. Browser runtime origin, when running on a known dev/staging host
 *     (localhost, 127.0.0.1, *.lovable.app, *.lovableproject.com, LAN IPs).
 *  4. `PRODUCTION_SITE_URL` fallback — the canonical live domain.
 *
 * Every user-facing URL (reseller API base, invite links, webhook URLs shown to
 * admins, bot deep links, auth redirects, SEO metadata) must be built from here
 * so local development never redirects to production and production never
 * redirects to a preview host.
 */

/** Canonical production domain. */
export const PRODUCTION_SITE_URL = "https://qorixlab.com";

const strip = (url: string) => url.trim().replace(/\/+$/, "");

/** Hosts that must never appear in bot links, webhooks or emails. */
function isDisallowedHost(hostname: string): boolean {
  return (
    hostname.endsWith(".lovable.app") ||
    hostname.endsWith(".lovableproject.com") ||
    hostname.endsWith(".lovable.dev")
  );
}

function isDisallowedUrl(url: string): boolean {
  try {
    return isDisallowedHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

function envOverride(): string | null {
  // Vite inlines import.meta.env on both client and server builds.
  const viteUrl =
    typeof import.meta !== "undefined"
      ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[
          "VITE_SITE_URL"
        ]
      : undefined;
  if (viteUrl && /^https?:\/\//.test(viteUrl) && !isDisallowedUrl(viteUrl)) return strip(viteUrl);

  if (typeof process !== "undefined" && process.env) {
    const serverUrl = process.env["SITE_URL"];
    if (serverUrl && /^https?:\/\//.test(serverUrl) && !isDisallowedUrl(serverUrl)) {
      return strip(serverUrl);
    }
  }
  return null;
}

function isNonProductionHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".lovable.app") ||
    hostname.endsWith(".lovableproject.com") ||
    hostname.endsWith(".lovable.dev") ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname)
  );
}

/** Resolve the current site origin (no trailing slash). Safe on client + server. */
export function resolveSiteOrigin(): string {
  const override = envOverride();
  if (override) return override;

  if (typeof window !== "undefined" && window.location?.origin) {
    // Preview / published Lovable subdomains must never leak into links.
    if (isDisallowedHost(window.location.hostname)) return PRODUCTION_SITE_URL;
    if (isNonProductionHost(window.location.hostname)) {
      return strip(window.location.origin);
    }
    // On any other real host, trust where the app is actually served from.
    return strip(window.location.origin);
  }

  return PRODUCTION_SITE_URL;
}

/** Current site URL. Prefer `resolveSiteOrigin()` inside server handlers. */
export const SITE_URL = resolveSiteOrigin();

/** SITE_URL without a trailing slash. */
export const SITE_ORIGIN = strip(SITE_URL);

/** Public domain without protocol, e.g. for display: `qorixlab.com`. */
export const SITE_DOMAIN = SITE_ORIGIN.replace(/^https?:\/\//, "");

/** Canonical origin for anything sent outside the browser (bot, webhook, email). */
export function canonicalOrigin(origin?: string): string {
  if (origin && /^https?:\/\//.test(origin) && !isDisallowedUrl(origin)) {
    return strip(origin);
  }
  return PRODUCTION_SITE_URL;
}

/** Build an absolute public URL for a path, resolved at call time. */
export function siteUrlFor(path = "/") {
  const origin = resolveSiteOrigin();
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Absolute URL that always points at the canonical production domain. */
export function productionUrlFor(path = "/") {
  return `${PRODUCTION_SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Base URL of the public reseller REST API (environment-aware). */
export const RESELLER_API_BASE = siteUrlFor("/api/public/reseller/v1");

/** Base URL of the reseller REST API on the live domain (for docs/copy). */
export const RESELLER_API_BASE_PRODUCTION = productionUrlFor(
  "/api/public/reseller/v1",
);
