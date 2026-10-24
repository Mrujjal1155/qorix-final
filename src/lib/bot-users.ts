import { z } from "zod";

export const BOT_USERS_PAGE_SIZE = 50;
export const botUserRequest = z.object({
  search: z.string().max(100).optional().default(""),
  balance: z.enum(["all", "with", "without"]).optional().default("all"),
  contact: z.enum(["all", "unknown", "reachable", "blocked", "deactivated", "stopped"]).optional().default("all"),
  page: z.number().int().min(0).max(100000).optional().default(0),
});
export type BotUserRequest = z.infer<typeof botUserRequest>;
export type BotUserStats = { total: number; banned: number; not_banned: number; balance: number; blocked: number; reachable: number; deactivated: number; stopped: number; unknown: number };