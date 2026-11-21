import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public by design: the random link id (shared only in the buyer's private bot chat) is the capability. */
export const getDirectPay = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { directPayInfo } = await import("@/lib/bot/engine.server");
    return await directPayInfo(data.id);
  });

export const beginDirectPay = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), method: z.string().min(1).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const { startDirectPay } = await import("@/lib/bot/engine.server");
    return await startDirectPay(data.id, data.method);
  });
