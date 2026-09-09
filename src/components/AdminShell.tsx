import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme";
import { SupplierBell } from "@/components/admin/SupplierBell";
import {
  Boxes,
  CreditCard,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  ReceiptText,
  Globe,
  KeyRound,
  Search,
  Network,
  Settings,
  Ticket,
  Users,
  BarChart3,
  LifeBuoy,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useSiteContent } from "@/lib/use-site-content";


const NAV_GROUPS = [
  {
    label: "Apps",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/admin/products", label: "Products", icon: Boxes },
      { to: "/admin/orders", label: "Orders", icon: ReceiptText },
      { to: "/admin/payments", label: "Payments", icon: CreditCard },
      { to: "/admin/suppliers", label: "Supplier APIs", icon: Network },
    ],
  },
  {
    label: "Pages",
    items: [
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/resellers", label: "Resellers", icon: KeyRound },
      { to: "/admin/codes", label: "Codes", icon: Ticket },
      { to: "/admin/site", label: "Website", icon: Globe },
      { to: "/admin/settings", label: "Settings", icon: Settings },
      { to: "/admin/support", label: "Support", icon: LifeBuoy },
      { to: "/admin/webhook", label: "Webhook", icon: Radio },
    ],
  },
] as const;

export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { v } = useSiteContent();
  const brandLogo = v("site_brand_logo");
  const brandName = v("site_brand_name") || "QORIX";

  useEffect(() => {
    setCollapsed(localStorage.getItem("qorix-admin-rail") === "collapsed");
  }, []);

  function toggleRail() {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen((o) => !o);
      return;
    }
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("qorix-admin-rail", next ? "collapsed" : "expanded");
      return next;
    });
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin", replace: true });
  }

  const labelCls = collapsed ? "lg:hidden" : "";

  return (
    <div className="admin-theme flex min-h-screen">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}
      {/* Vertical sidebar — drawer on mobile, collapsible rail on desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[15.5rem] shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0 lg:transition-[width]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[4.25rem]" : "lg:w-[15.5rem]",
        )}
      >
        <div className={cn("flex items-center px-5 py-5", collapsed && "lg:justify-center lg:px-3")}>
          <BrandLogo
            src={brandLogo}
            name={brandName}
            className={cn(
              "h-auto max-h-12 w-full shrink-0 rounded-lg object-contain",
              collapsed && "lg:size-11 lg:max-h-none lg:w-auto",
            )}
            textClassName={collapsed ? "text-base" : "text-xl"}
          />
        </div>

        <nav className={cn("flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4", collapsed && "lg:px-2")}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              <p
                className={cn(
                  "px-3 pb-1 pt-4 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70",
                  labelCls,
                )}
              >
                {group.label}
              </p>
              {collapsed && <div className="my-2 hidden h-px bg-sidebar-border lg:block" />}
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/admin" }}
                  title={item.label}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "lg:justify-center",
                  )}
                  activeProps={{
                    className: "admin-rail-active text-foreground hover:text-foreground",
                  }}
                >
                  <item.icon className="size-[1.15rem] shrink-0" />
                  <span className={labelCls}>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className={cn("mt-auto border-t border-sidebar-border px-3 py-3", collapsed && "lg:px-2")}>
          <button
            onClick={signOut}
            className={cn(
              "flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "lg:justify-center",
            )}
          >
            <LogOut className="size-[1.15rem] shrink-0" />
            <span className={labelCls}>Sign out</span>
          </button>
        </div>
      </aside>


      {/* Main column */}
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
          <label className="mx-auto hidden w-full min-w-0 max-w-md items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2 sm:flex">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              placeholder="Search…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <SupplierBell />
            {actions}
          </div>
        </header>


        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-4 pt-6 sm:pt-8 lg:px-8">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">{title}</h1>

            <p className="truncate text-sm text-muted-foreground lg:text-base">
              {subtitle ?? "Here's what's going on at your business right now"}
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <span className="size-1.5 rounded-full bg-success" /> Systems online
          </span>
        </div>

        <main className="min-w-0 px-4 pb-10 pt-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}


export function money(n: unknown) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

/** Shared panel wrapper so every admin page has the same crimson-on-carbon surface. */
export function AdminPanel({
  title,
  action,
  className,
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("admin-panel rounded-2xl", className)}>
      {(title || action) && (
        <div className="flex items-center gap-3 border-b border-border/70 px-5 py-3.5">
          {title && <h2 className="text-base font-bold tracking-tight">{title}</h2>}
          {action && <div className="ml-auto">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
