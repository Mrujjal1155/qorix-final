import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSiteContent } from "@/lib/use-site-content";
import maintenanceImg from "@/assets/maintenance.jpg";

/** Paths that always stay open so the admin can switch maintenance off. */
const OPEN_PREFIXES = ["/admin", "/auth", "/api"];

/**
 * Website maintenance screen. Independent from the bot maintenance switch.
 * Signed-in admins still see the normal site (with a small notice bar).
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { v } = useSiteContent();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const on = v("site_maintenance").toLowerCase() === "on";
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return alive && setIsAdmin(false);
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (alive) setIsAdmin(Boolean(role));
    };
    void check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => void check());
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [on]);

  const open = OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!on || open) return <>{children}</>;

  if (isAdmin)
    return (
      <>
        <div className="sticky top-0 z-[60] bg-destructive px-4 py-1.5 text-center text-xs font-semibold text-destructive-foreground">
          Maintenance mode is ON — visitors see the maintenance screen. You see the site because you are an admin.
        </div>
        {children}
      </>
    );

  const img = v("site_maintenance_image") || maintenanceImg;
  const msg =
    v("site_maintenance_message") ||
    "We're upgrading the store to serve you better. Please check back shortly.";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10 text-center">
      <img
        src={img}
        alt="Site under maintenance"
        width={1536}
        height={864}
        className="w-full max-w-3xl rounded-2xl border border-border/60 shadow-2xl"
      />
      <div className="max-w-xl space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Site under maintenance
        </h1>
        <p className="whitespace-pre-line text-sm text-muted-foreground sm:text-base">{msg}</p>
      </div>
    </main>
  );
}
