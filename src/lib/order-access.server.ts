/**
 * Proof-of-ownership for guest website orders.
 * order_no is sequential and emails are guessable, so sensitive fields
 * (delivered content, wallet) require either an HMAC access token that was
 * only ever sent to the buyer, or a signed-in session for the same email.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { getRequest } from "@tanstack/react-start/server";

function secret() {
  const s = process.env["ORDER_LINK_SECRET"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!s) throw new Error("Server misconfigured");
  return s;
}

export function orderAccessToken(orderNo: number | string, email: string) {
  return createHmac("sha256", secret())
    .update(`order:${Number(orderNo)}:${String(email).trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 32);
}

export function verifyOrderAccessToken(orderNo: number | string, email: string, token: string | undefined | null) {
  if (!token) return false;
  const a = Buffer.from(orderAccessToken(orderNo, email));
  const b = Buffer.from(String(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Email of the signed-in caller (verified with Supabase Auth), or null. */
export async function callerEmail(): Promise<string | null> {
  try {
    const h = getRequest()?.headers.get("authorization") ?? "";
    if (!h.startsWith("Bearer ")) return null;
    const token = h.slice(7);
    if (token.split(".").length !== 3) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user?.email) return null;
    return data.user.email.toLowerCase();
  } catch {
    return null;
  }
}
