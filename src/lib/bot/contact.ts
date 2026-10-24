export type ContactStatus = "unknown" | "reachable" | "blocked" | "deactivated" | "stopped";
export const TELEGRAM_UPDATES = ["message", "edited_message", "callback_query", "my_chat_member"];

export function membershipContact(update: any): { id: number; status: ContactStatus; at: string } | null {
  const member = update?.my_chat_member;
  if (member?.chat?.type !== "private" || !Number.isSafeInteger(member.chat.id) || member.chat.id <= 0 || !Number.isFinite(member.date)) return null;
  const status = member.new_chat_member?.status;
  const contact = status === "kicked" ? "blocked" : status === "left" ? "stopped" : status === "member" ? "reachable" : null;
  return contact ? { id: member.chat.id, status: contact, at: new Date(member.date * 1000).toISOString() } : null;
}

export function deliveryContact(method: string, body: Record<string, unknown>, result: { ok: boolean; description?: string }): { id: number; status: ContactStatus } | null {
  // Editing/deleting old messages does not establish current reachability.
  if (!/^send/.test(method) && method !== "copyMessage" && method !== "forwardMessage") return null;
  const id = Number(body.chat_id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (result.ok) return { id, status: "reachable" };
  const reason = (result.description ?? "").trim().toLowerCase();
  if (reason === "forbidden: bot was blocked by the user") return { id, status: "blocked" };
  if (reason === "forbidden: user is deactivated") return { id, status: "deactivated" };
  return null;
}