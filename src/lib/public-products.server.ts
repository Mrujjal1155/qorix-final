import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Public handlers must read this fixed safe projection, never raw products. */
export function publicProducts() {
  return supabaseAdmin.from("public_products");
}