import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { applyReferralCode } from "@/lib/referral.functions";

const KEY = "qorix-ref-code";

/**
 * Website referral capture:
 *  - stores ?ref=CODE from any landing URL
 *  - attaches it to the account as soon as the visitor is signed in
 */
export function ReferralCapture() {
  const apply = useServerFn(applyReferralCode);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const code = new URLSearchParams(window.location.search).get("ref");
      if (code) localStorage.setItem(KEY, code.trim().toUpperCase().slice(0, 16));
    } catch {
      /* ignore */
    }

    let cancelled = false;
    const tryApply = async () => {
      const code = localStorage.getItem(KEY);
      if (!code) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session || cancelled) return;
      try {
        const res: any = await apply({ data: { code } });
        // Stop retrying once it is resolved one way or another.
        if (res?.ok || ["already", "self", "invalid", "empty"].includes(res?.reason)) {
          localStorage.removeItem(KEY);
        }
      } catch {
        /* silent */
      }
    };

    void tryApply();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") void tryApply();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [apply]);

  return null;
}
