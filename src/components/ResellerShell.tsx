import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Globe,
  KeyRound,
  ListOrdered,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  Store,
  Tags,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/theme";
import { cn } from "@/lib/utils";
import { useSiteContent } from "@/lib/use-site-content";
import { BrandLogo } from "@/components/BrandLogo";

export type ResellerTab =
  | "analytics"
  | "api"
  | "balance"
  | "orders"
  | "reports"
  | "catalogue"
  | "site";

type Item = { id: ResellerTab; label: string; icon: ComponentType<{ className?: string }> };

const NAV_GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Overview",
    items: [
      { id: "analytics", label: "Analytics", icon: BarChart3 },
      { id: "reports", label: "Reports", icon: TrendingUp },
      { id: "orders", label: "Orders", icon: ListOrdered },
    ],
  },
  {
    label: "Business",
    items: [
      { id: "catalogue", label: "Price list", icon: Tags },
      { id: "balance", label: "Balance", icon: Wallet },
    ],
  },
  {
    label: "Setup",
    items: [
      { id: "api", label: "API key", icon: KeyRound },
      { id: "site", label: "My site", icon: Globe },
    ],
  },
];

export function ResellerShell({
  title,
  subtitle,
  actions,
  active,
  onSelect,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
  active: ResellerTab;
  onSelect: (tab: ResellerTab) => void;
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
    setCollapsed(localStorage.getItem("qorix-reseller-rail") === "collapsed");
  }, []);

  function toggleRail() {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen((o) => !o);
      return;
    }
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("qorix-reseller-rail", next ? "collapsed" : "expanded");
      return next;
    });
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
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
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    setMobileOpen(false);
                  }}
                  title={item.label}
                  className={cn(
                    "flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active === item.id
                      ? "admin-rail-active text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "lg:justify-center",
                  )}
                >
                  <item.icon className="size-[1.15rem] shrink-0" />
                  <span className={labelCls}>{item.label}</span>
                </button>
              ))}
            </div>
          ))}

          <p
            className={cn(
              "px-3 pb-1 pt-4 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70",
              labelCls,
            )}
          >
            Links
          </p>
          {collapsed && <div className="my-2 hidden h-px bg-sidebar-border lg:block" />}
          {[
            { to: "/reseller/docs", label: "API docs", icon: BookOpen },
            { to: "/store", label: "Store", icon: Store },
            { to: "/account", label: "My account", icon: ShoppingBag },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              title={l.label}
              onClick={() => setMobileOpen(false)}
              activeOptions={{ exact: true }}
              activeProps={{ className: "admin-rail-active text-foreground" }}
              className={cn(
                "flex items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "lg:justify-center",
              )}
            >
              <l.icon className="size-[1.15rem] shrink-0" />
              <span className={labelCls}>{l.label}</span>
            </Link>
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border/70 bg-sidebar px-4 py-3 lg:px-6">
          <button
            onClick={toggleRail}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {actions}
          </div>
        </header>

        <div className="px-4 pt-6 sm:pt-8 lg:px-8">
          <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground lg:text-base">{subtitle}</p>}
        </div>


        <main className="min-w-0 px-4 pb-10 pt-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
