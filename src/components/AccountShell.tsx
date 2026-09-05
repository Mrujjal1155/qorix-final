import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Gift,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Store,
  Truck,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/theme";
import { cn } from "@/lib/utils";
import { useSiteContent } from "@/lib/use-site-content";
import { BrandLogo } from "@/components/BrandLogo";

const NAV_GROUPS = [
  {
    label: "Account",
    items: [
      { to: "/account", label: "Overview", icon: LayoutDashboard, exact: true },
      { to: "/account/orders", label: "My orders", icon: Package, exact: false },
      { to: "/account/referrals", label: "Referrals", icon: Gift, exact: false },
      { to: "/account/profile", label: "Profile", icon: UserRound, exact: false },
    ],
  },
  {
    label: "Shop",
    items: [
      { to: "/store", label: "Store", icon: Store, exact: false },
      { to: "/track", label: "Track order", icon: Truck, exact: false },
    ],
  },
] as const;

export function AccountShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const { v } = useSiteContent();
  const brandLogo = v("site_brand_logo");
  const brandName = v("site_brand_name") || "QORIX";

  useEffect(() => {
    setCollapsed(localStorage.getItem("qorix-account-rail") === "collapsed");
  }, []);

  function toggleRail() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("qorix-account-rail", next ? "collapsed" : "expanded");
      return next;
    });
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const showLabels = !collapsed;

  return (
    <div className="admin-theme flex min-h-screen">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
          collapsed ? "w-[4.25rem]" : "w-[15.5rem]",
        )}
      >
        <div className={cn("flex items-center py-5", collapsed ? "justify-center px-3" : "px-5")}>
          <Link to="/" title="Go to home" className="flex w-full items-center justify-center">
            <BrandLogo
              src={brandLogo}
              name={brandName}
              className={cn(
                "shrink-0 rounded-lg object-contain",
                collapsed ? "size-11" : "h-auto w-full max-h-12",
              )}
              textClassName={collapsed ? "text-base" : "text-xl"}
            />
          </Link>
        </div>


        <nav className={cn("flex flex-1 flex-col gap-1 overflow-y-auto pb-4", collapsed ? "px-2" : "px-3")}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              {showLabels ? (
                <p className="px-3 pb-1 pt-4 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                  {group.label}
                </p>
              ) : (
                <div className="my-2 h-px bg-sidebar-border" />
              )}
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  title={item.label}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed ? "justify-center" : "justify-start",
                  )}
                  activeProps={{ className: "admin-rail-active text-foreground hover:text-foreground" }}
                >
                  <item.icon className="size-[1.15rem] shrink-0" />
                  {showLabels && <span>{item.label}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className={cn("mt-auto border-t border-sidebar-border py-3", collapsed ? "px-2" : "px-3")}>
          <button
            onClick={signOut}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed ? "justify-center" : "justify-start",
            )}
          >
            <LogOut className="size-[1.15rem] shrink-0" />
            {showLabels && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 bg-sidebar px-4 py-3 lg:px-6">
          <button
            onClick={toggleRail}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          <label className="mx-auto flex w-full min-w-0 max-w-md items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              placeholder="Search…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {actions}
          </div>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-4 pt-8 lg:px-8">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-extrabold tracking-tight lg:text-4xl">{title}</h1>
            <p className="truncate text-sm text-muted-foreground lg:text-base">
              {subtitle ?? "Your orders, deliveries and profile in one place"}
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <span className="size-1.5 rounded-full bg-success" /> Account active
          </span>
        </div>

        <main className="min-w-0 px-4 pb-10 pt-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function statusTone(status: string) {
  if (status === "completed") return "text-success";
  if (status === "cancelled" || status === "rejected") return "text-destructive";
  return "text-primary";
}
