// Forward an unmatched customer question from the existing bot to n8n.
//
// This is additive only: it runs *after* every existing command, button and
// state handler has declined the message. When it is off (or n8n fails) the
// bot keeps its original reply.

export type RelayMessage = {
  chat_id: number;
  message_id?: number;
  text: string;
  user: { id: number; username?: string | null; first_name?: string | null; language_code?: string | null };
};

export async function relayToN8n(
  settings: Record<string, string>,
  message: RelayMessage,
): Promise<boolean> {
  if ((settings["n8n_ai_enabled"] ?? "0") !== "1") return false;
  const url = (settings["n8n_webhook_url"] ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return false;

  const key = process.env["N8N_API_KEY"] || (settings["n8n_api_key"] ?? "").trim();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "X-N8N-Key": key } : {}),
      },
      body: JSON.stringify({ source: "telegram-bot", ...message }),
    });
    if (!res.ok) {
      console.error(`n8n relay failed [${res.status}]: ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("n8n relay error:", error);
    return false;
  }
}
