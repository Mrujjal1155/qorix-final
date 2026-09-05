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
  const { v } = useSiteContent();
  const brandLogo = v("site_brand_logo");
  const brandName = v("site_brand_name") || "QORIX";

  useEffect(() => {
    setCollapsed(localStorage.getItem("qorix-reseller-rail") === "collapsed");
  }, []);

  function toggleRail() {
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
          <BrandLogo
            src={brandLogo}
            name={brandName}
            className={cn(
              "shrink-0 rounded-lg object-contain",
              collapsed ? "size-11" : "h-auto w-full max-h-12",
            )}
            textClassName={collapsed ? "text-base" : "text-xl"}
          />
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
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  title={item.label}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active === item.id
                      ? "admin-rail-active text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed ? "justify-center" : "justify-start",
                  )}
                >
                  <item.icon className="size-[1.15rem] shrink-0" />
                  {showLabels && <span>{item.label}</span>}
                </button>
              ))}
            </div>
          ))}

          {showLabels ? (
            <p className="px-3 pb-1 pt-4 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
              Links
            </p>
          ) : (
            <div className="my-2 h-px bg-sidebar-border" />
          )}
          {[
            { to: "/reseller/docs", label: "API docs", icon: BookOpen },
            { to: "/store", label: "Store", icon: Store },
            { to: "/account", label: "My account", icon: ShoppingBag },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              title={l.label}
              activeOptions={{ exact: true }}
              activeProps={{ className: "admin-rail-active text-foreground" }}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed ? "justify-center" : "justify-start",
              )}
            >
              <l.icon className="size-[1.15rem] shrink-0" />
              {showLabels && <span>{l.label}</span>}
            </Link>
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

        <div className="px-4 pt-8 lg:px-8">
          <h1 className="truncate text-3xl font-extrabold tracking-tight lg:text-4xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground lg:text-base">{subtitle}</p>}
        </div>

        <main className="min-w-0 px-4 pb-10 pt-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
