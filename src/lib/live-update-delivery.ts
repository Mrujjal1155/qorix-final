import type { LiveKind } from "@/lib/live-update";
import { notifyChatId, parseNotifyMatrix } from "@/lib/telegram-notify-routes";

export type LiveEventKind = LiveKind | "payment";

export function liveDestinations(
  event: { kind: LiveEventKind; general_enabled?: boolean; live_sent?: boolean; general_sent?: boolean; delivery_errors?: Record<string, { status: string }> },
  settings: Record<string, string>,
) {
  const matrix = parseNotifyMatrix(settings["notify_routes"]);
  if (matrix) {
    // Admin matrix: "general" slot = General Chat, "live" slot = Store Updates
    // then Official Channel (extra posts ride on the live slot).
    const nk = event.kind === "purchase" ? "live_purchase" : event.kind === "member" ? "live_member" : "live_payment";
    const blocked = (slot: string) => ["failed", "review"].includes(event.delivery_errors?.[slot]?.status ?? "");
    const liveTargets = (["updates", "channel"] as const).filter((d) => matrix[d][nk]).map((d) => notifyChatId(settings, d)).filter(Boolean);
    const generalId = matrix.general[nk] ? notifyChatId(settings, "general") : "";
    const uniqueLive = [...new Set(liveTargets)].filter((id) => id !== generalId || !matrix.general[nk]);
    return {
      live: !event.live_sent && !blocked("live") ? (uniqueLive[0] ?? "") : "",
      liveExtra: !event.live_sent && !blocked("live") ? uniqueLive.slice(1) : [],
      // Purchases keep their general-slot opt-in; other kinds always may use it.
      general: !event.general_sent && !blocked("general") && (event.kind !== "purchase" || event.general_enabled) ? generalId : "",
    };
  }
  const key = event.kind === "purchase" ? "live_purchase" : event.kind === "member" ? "live_member" : "live_topup";
  const liveOn = (settings[key] ?? "on").toLowerCase() === "on";
  const generalOn = event.kind === "purchase"
    ? (settings["announce_sales"] ?? "on").toLowerCase() !== "off"
    : liveOn;
  return {
    live: !event.live_sent && !["failed", "review"].includes(event.delivery_errors?.["live"]?.status ?? "") && liveOn ? (settings["live_channel_id"] ?? "").trim() : "",
    general: !event.general_sent && !["failed", "review"].includes(event.delivery_errors?.["general"]?.status ?? "") && event.general_enabled && generalOn
      ? (settings["announce_chat_id"] ?? "").trim() : "",
  };
}

// Retry only Telegram's explicit rate-limit refusal. A transport failure can
// mean the post was accepted; blind replay would leak duplicates into groups.
export function liveFailure(result: { error_code?: number; parameters?: { retry_after?: number } }) {
  if (result.error_code === 429) return { status: "pending", delay: Math.max(1, Number(result.parameters?.retry_after ?? 30)) };
  return { status: result.error_code === 400 || result.error_code === 403 ? "failed" : "review", delay: 0 };
}