// Short-lived, bounded, per-isolate caches for READ-ONLY reseller API calls.
// Correctness never depends on these: a miss / cold isolate falls back to the
// normal database path. Never used for orders, balance, or stock claiming.

type Entry<T> = { v: T; exp: number };

/** Tiny TTL map with a hard size cap (oldest entry evicted first). */
export class TtlCache<T> {
  private m = new Map<string, Entry<T>>();
  constructor(private ttlMs: number, private max: number) {}
  get(k: string): T | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp <= Date.now()) {
      this.m.delete(k);
      return undefined;
    }
    return e.v;
  }
  set(k: string, v: T) {
    if (this.m.has(k)) this.m.delete(k);
    else if (this.m.size >= this.max) {
      const first = this.m.keys().next().value;
      if (first !== undefined) this.m.delete(first);
    }
    this.m.set(k, { v, exp: Date.now() + this.ttlMs });
  }
}

/** SHA-256 hex — the raw API key is never used as a cache key or stored. */
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const AUTH_TTL_MS = 30_000;
export const PRODUCT_TTL_MS = 10_000;
export const LAST_USED_MIN_GAP_MS = 60_000;
