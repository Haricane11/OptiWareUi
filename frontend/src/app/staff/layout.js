"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Package, Navigation, Map, ClipboardList, LogOut, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import OptiWareLogo from "@/components/OptiWareLogo";
import { useAuth } from "@/context/AuthContext";

export default function StaffLayout({ children }) {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isOutbound = user?.team === "Outbound";

  const tabs = [
    ...(isOutbound ? [] : [{ label: "Receive", icon: Package, path: "/staff/receive" }]),
    { 
      label: isOutbound ? "Pick Up" : "Put-away", 
      icon: Navigation, 
      path: isOutbound ? "/staff/pickup" : "/staff/putaway" 
    },
    { label: "Map", icon: Map, path: "/staff/map" },
    // { label: "Tasks", icon: ClipboardList, path: "/staff/tasks" },
    { 
      label: isOutbound ? "Delivery Notes" : "Invoices", 
      icon: Receipt, 
      path: "/staff/invoices" 
    },
  ];

  useEffect(() => {
    if (!loading) {
      if (!user || user.role !== "staff") {
        router.push("/login");
      } else if (isOutbound && pathname === "/staff/receive") {
        router.push("/staff/pickup");
      }
    }
  }, [user, loading, router, isOutbound, pathname]);

  if (loading || !user || user.role !== "staff") {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="flex flex-col min-h-screen w-full bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20">
        <OptiWareLogo size="sm" />
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end mr-2">
            <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">{user.team || "General"} Team</span>
            <span className="text-[9px] text-muted-foreground leading-none">{user.username}</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20 px-4 py-5">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card/90 backdrop-blur-xl border-t border-border">
        <div className="flex items-center justify-around py-2">
          {tabs.map((tab) => {
            const isActive = pathname === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => router.push(tab.path)}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 px-4 rounded-lg transition-all duration-200 min-w-[64px]",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon size={22} strokeWidth={isActive ? 2.3 : 1.8} />
                <span className={cn("text-[10px] font-medium", isActive && "font-semibold")}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
