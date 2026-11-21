import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { browserGateway, browserPaymentInput } from "@/lib/bot/browser-payment";

export const previewBrowserPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => browserPaymentInput.parse(d))
  .handler(async ({ data }) => {
    const { browserPaymentPreview } = await import("@/lib/bot/browser-payment.server");
    return browserPaymentPreview(data.token);
  });
export const createBrowserPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => browserPaymentInput.extend({ gateway: browserGateway }).parse(d))
  .handler(async ({ data }) => {
    const { startBrowserPayment } = await import("@/lib/bot/browser-payment.server");
    return startBrowserPayment(data.token, data.gateway);
  });
export const checkBrowserPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => browserPaymentInput.extend({ txid: z.string().trim().max(128).default("") }).parse(d))
  .handler(async ({ data }) => {
    const { verifyBrowserPayment } = await import("@/lib/bot/browser-payment.server");
    return verifyBrowserPayment(data.token, data.txid);
  });