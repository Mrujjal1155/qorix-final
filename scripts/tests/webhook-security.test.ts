import { describe, expect, test } from "bun:test";
import { checkedWebhookUrl, isPublicAddress, publicWebhookUrl, sendCheckedWebhook } from "../../src/lib/webhook-destination.server";

describe("Reseller webhook destination security", () => {
  test("private and ambiguous URLs are rejected before sending", () => {
    for (const url of ["http://shop.com", "https://127.0.0.1", "https://2130706433", "https://[::1]", "https://localhost", "https://shop.internal", "https://user:password@shop.com", "https://shop.com:8443"]) {
      expect(() => publicWebhookUrl(url)).toThrow();
    }
    expect(publicWebhookUrl("https://shop.com/api/events").toString()).toBe("https://shop.com/api/events");
  });
  test("private, link-local and mapped IPv6 addresses are not public", () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPublicAddress(address)).toBe(false);
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  test("DNS resolving to an internal address never receives a payload", async () => {
    let payloadRequests = 0;
    const mock = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname !== "cloudflare-dns.com") payloadRequests++;
      return Response.json({ Status: 0, Answer: [{ type: 1, data: "10.0.0.2" }] });
    }) as typeof fetch;
    await expect(sendCheckedWebhook("https://shop.com/events", { method: "POST", body: "private" }, mock)).rejects.toThrow();
    expect(payloadRequests).toBe(0);
  });
  test("DNS failure fails closed", async () => {
    const mock = (async () => Response.json({ Status: 2 })) as typeof fetch;
    await expect(checkedWebhookUrl("https://shop.com/events", mock)).rejects.toThrow();
  });
  test("a signed webhook never follows redirects", async () => {
    let options: RequestInit | undefined;
    let deliveries = 0;
    const mock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(input)).hostname === "cloudflare-dns.com") return Response.json({ Status: 0, Answer: [{ type: 1, data: "1.1.1.1" }] });
      options = init;
      deliveries++;
      return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
    }) as typeof fetch;
    const response = await sendCheckedWebhook("https://shop.com/events", { method: "POST", body: "signed" }, mock);
    expect(response.status).toBe(302);
    expect(deliveries).toBe(1);
    expect(options?.redirect).toBe("manual");
  });
});