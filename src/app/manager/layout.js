"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, ShoppingCart, FileText, Receipt, Truck, Package,
  Layers, Eye, AlertTriangle, DollarSign, RefreshCw, Settings, LayoutGrid,
  ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";
import OptiWareLogo from "@/components/OptiWareLogo";
import { NavLink } from "@/components/NavLink";
import WarehouseWizard from "@/components/WarehouseWizard";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWms } from '@/context/WmsContext';



export default function ManagerLayout({ children }) {
  
  const [collapsed, setCollapsed] = useState(false);
  const [showWarehouseWizard, setShowWarehouseWizard] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);
  const { user, logout, loading } = useAuth();
  const { state: wmsState } = useWms();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || user.role !== "manager")) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const ownWarehouse = (wmsState.warehouses || []).find(wh => wh.created_by === user?.id);

  const warehouseSetupItems = [];
  console.log(user)
  if (user?.role === 'manager') {
    if (ownWarehouse) {
      warehouseSetupItems.push(
        { title: 'Update Warehouse', onClick: () => { setShowWarehouseWizard(true); setSelectedWarehouseId(ownWarehouse.id); }, icon: Settings },
        { title: 'Shelves Layout', url: `/manager/warehouse/layout?warehouseId=${ownWarehouse.id}`, icon: Layers },
        { title: 'Shelves View', url: `/manager/warehouse`, icon: Eye }
      );
    } else {
      warehouseSetupItems.push({ title: 'Create Warehouse', onClick: () => { setShowWarehouseWizard(true); setSelectedWarehouseId(null); }, icon: LayoutGrid });
    }
  }

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
        { title: "Stock Monitor", url: "/manager/stock-monitor", icon: AlertTriangle },
        { title: "Financial Loss", url: "/manager/financial-loss", icon: DollarSign },
        { title: "Reorder Decisions", url: "/manager/reorder-decisions", icon: RefreshCw },
      ],
    },
    {
      label: "Warehouse Setup",
      items: warehouseSetupItems,
    },
  ];

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
                {group.items.map((item, index) => {
                  const itemPath = item.url?.split('?')[0]?.replace(/\/$/, '');
                  const currentPath = pathname?.replace(/\/$/, '');
                  
                  const isActive = (itemPath === '/manager' || itemPath === '/manager/warehouse' || itemPath === '/manager/warehouse/layout') 
                    ? currentPath === itemPath 
                    : itemPath && currentPath.startsWith(itemPath);
                  return (
                    <div key={index}>
                      {item.url ? (
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
                      ) : (
                        <button
                          key={item.title}
                          onClick={item.onClick}
                          className={cn(
                            "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm transition-all duration-200",
                            isActive
                              ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm"
                              : "hover:bg-sidebar-accent hover:text-sidebar-foreground text-sidebar-foreground/70"
                          )}
                        >
                          <item.icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                          {!collapsed && <span>{item.title}</span>}
                        </button>
                      )}
                    </div>
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
          "flex-1 transition-all duration-300 h-screen flex flex-col overflow-hidden",
          collapsed ? "ml-16" : "ml-60"
        )}
      >
        <div className="flex-1 flex flex-col p-6 min-h-0">
          {children}
        </div>
      </main>

      {showWarehouseWizard && (
        <WarehouseWizard
          isUpdate={!!selectedWarehouseId}
          warehouseId={selectedWarehouseId}
          onClose={() => setShowWarehouseWizard(false)}
        />
      )}
    </div>
  );
}
