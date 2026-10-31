import { z } from "zod";

export const customerAlertSettingSchema = z.object({ id: z.string().uuid(), enabled: z.boolean() });
export const alertQueuePageSchema = z.object({ offset: z.number().int().min(0).max(1_000_000).default(0) });
export const cancelAlertSchema = z.object({ id: z.string().uuid() });