import ipaddr from "ipaddr.js";

/** Reject non-public destinations. DNS preflight is defense in depth, not DNS pinning. */
export function publicWebhookUrl(raw: string): URL {
  if (raw.length > 2048) throw new Error("Invalid webhook destination");
  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      (url.port && url.port !== "443") || !host.includes(".") ||
      /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host) ||
      host.startsWith("[") || ipaddr.isValid(host)) {
    throw new Error("Use a public HTTPS webhook address without credentials or a custom port");
  }
  url.hostname = host;
  return url;
}

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}

export async function checkedWebhookUrl(raw: string, resolveFetch: typeof fetch = fetch): Promise<string> {
  const url = publicWebhookUrl(raw);
  const answers = await Promise.all(["A", "AAAA"].map(async (type) => {
    const lookup = new URL("https://cloudflare-dns.com/dns-query");
    lookup.searchParams.set("name", url.hostname);
    lookup.searchParams.set("type", type);
    const response = await resolveFetch(lookup, {
      headers: { accept: "application/dns-json" }, redirect: "error", signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error("Webhook destination could not be verified");
    const result = await response.json() as { Status?: number; Answer?: { type: number; data: string }[] };
    if (result.Status !== 0) throw new Error("Webhook destination could not be verified");
    return (result.Answer ?? []).filter((answer) => answer.type === 1 || answer.type === 28).map((answer) => answer.data);
  }));
  const addresses = answers.flat();
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
    throw new Error("Webhook destination must resolve only to public addresses");
  }
  return url.toString();
}

export async function sendCheckedWebhook(raw: string, init: RequestInit, send: typeof fetch = fetch): Promise<Response> {
  const url = await checkedWebhookUrl(raw, send);
  // Never forward a signed payload to a redirect target.
  return send(url, { ...init, redirect: "manual" });
}