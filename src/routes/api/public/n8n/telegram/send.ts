import { createFileRoute } from "@tanstack/react-router";

// n8n → existing Telegram bot. The bot token never leaves the server: n8n only
// holds the shared X-N8N-Key. Text messages only, no admin actions.
export const Route = createFileRoute("/api/public/n8n/telegram/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { n8nKeyOk } = await import("@/lib/n8n/api.server");
        if (!(await n8nKeyOk(request))) return new Response("Unauthorized", { status: 401 });

        let body: { chat_id?: unknown; text?: unknown; reply_to?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const chatId = Number(body.chat_id);
        const text = String(body.text ?? "").trim();
        if (!Number.isFinite(chatId) || chatId === 0 || !text) {
          return Response.json({ ok: false, error: "chat_id and text are required" }, { status: 400 });
        }

        const { sendMessage } = await import("@/lib/telegram.server");
        // Telegram rejects anything past 4096 characters; split instead of losing the reply.
        const chunks: string[] = [];
        for (let i = 0; i < text.length && chunks.length < 5; i += 3900) chunks.push(text.slice(i, i + 3900));

        const results = [] as { ok: boolean; description?: string }[];
        for (const chunk of chunks) {
          const res = await sendMessage(
            chatId,
            chunk,
            undefined,
            body.reply_to ? { reply_to_message_id: Number(body.reply_to) } : {},
          );
          results.push({ ok: Boolean(res.ok), ...(res.description ? { description: res.description } : {}) });
          if (!res.ok) break;
        }

        const ok = results.every((r) => r.ok);
        return Response.json({ ok, parts: results }, { status: ok ? 200 : 502 });
      },
    },
  },
});
