import { BOT_USERS_PAGE_SIZE, type BotUserRequest } from "./bot-users";

export async function readBotUserPage(sb: any, input: BotUserRequest) {
  let query = sb.from("bot_users").select("telegram_id,username,first_name,balance,total_spent,membership,referral_count,is_banned,contact_status,contact_status_at", { count: "exact" });
  if (input.balance === "with") query = query.gt("balance", 0);
  if (input.balance === "without") query = query.lte("balance", 0);
  if (input.contact !== "all") query = query.eq("contact_status", input.contact);
  const search = input.search.trim().replace(/^@/, "").replace(/[%,]/g, "");
  if (search) query = /^\d+$/.test(search) ? query.eq("telegram_id", Number(search)) : query.ilike("username", `%${search}%`);
  query = query.order(input.balance === "with" ? "balance" : "created_at", { ascending: false }).order("telegram_id", { ascending: false });
  const start = input.page * BOT_USERS_PAGE_SIZE;
  const { data, count, error } = await query.range(start, start + BOT_USERS_PAGE_SIZE - 1);
  if (error) throw new Error("Could not load bot users");
  return { rows: data ?? [], count: count ?? 0, page: input.page, pageSize: BOT_USERS_PAGE_SIZE };
}