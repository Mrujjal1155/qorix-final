import type { ContactStatus } from "./contact";

export async function recordContact(id: number, status: ContactStatus, at: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("record_bot_contact", {
    _telegram_id: id, _status: status, _observed_at: at,
  });
  if (error) throw new Error("Could not save Telegram contact status");
}