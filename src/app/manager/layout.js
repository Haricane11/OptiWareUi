"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, ShoppingCart, FileText, Receipt, Truck, Package,
  Layers, Eye, AlertTriangle, DollarSign, RefreshCw, Settings,
  ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";
import OptiWareLogo from "@/components/OptiWareLogo";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const navGroups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/manager", icon: LayoutDashboard },
    ],
  },
  {
    label: "Procurement",
    items: [
      { title: "Suppliers", url: "/manager/suppliers", icon: ShoppingCart },
      { title: "Purchase Orders", url: "/manager/purchase-orders", icon: FileText },
      { title: "Purchase Invoices", url: "/manager/invoices", icon: Receipt },
    ],
  },
  {
    label: "Fulfillment",
    items: [
      { title: "Sales Orders", url: "/manager/sales-orders", icon: Truck },
      { title: "Delivery Notes", url: "/manager/delivery-notes", icon: Package },
    ],
  },
  {
    label: "Inventory",
    items: [
      { title: "Shelves Layout", url: "/manager/shelves-layout", icon: Layers },
      { title: "Shelves View", url: "/manager/shelves-view", icon: Eye },
      { title: "Stock Monitor", url: "/manager/stock-monitor", icon: AlertTriangle },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Financial Loss", url: "/manager/financial-loss", icon: DollarSign },
      { title: "Reorder Decisions", url: "/manager/reorder-decisions", icon: RefreshCw },
    ],
  },
];

export default function ManagerLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || user.role !== "manager")) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== "manager") {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-screen z-30 flex flex-col transition-all duration-300 border-r",
          "bg-sidebar text-sidebar-foreground border-sidebar-border",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-3 py-4 border-b border-sidebar-border">
          {!collapsed && <OptiWareLogo size="sm" />}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <span className="text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/40 font-semibold px-2 mb-1.5 block">
                  {group.label}
                </span>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.url;
                  return (
                    <NavLink
                      key={item.url}
                      href={item.url}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-200",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm"
                          : "hover:bg-sidebar-accent hover:text-sidebar-foreground text-sidebar-foreground/70"
                      )}
                    >
                      <item.icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={logout}
            className={cn(
              "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-all duration-200",
              collapsed && "justify-center px-0"
            )}
          >
            <LogOut size={18} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          collapsed ? "ml-16" : "ml-60"
        )}
      >
        <div className="p-6 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
