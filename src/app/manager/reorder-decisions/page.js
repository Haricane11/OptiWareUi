"use client";

import { motion } from "framer-motion";
import { RefreshCw, CheckCircle2, AlertTriangle, TrendingUp, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const suggestions = [
  { id: "R-001", product: "Organic Milk (2L)", sku: "OM-2L-001", currentStock: 5, rop: 20, eoq: 200, supplier: "FreshCo Ltd.", estimatedCost: "$800", leadTime: "3 days", urgency: "critical" },
  { id: "R-002", product: "Steel Rods (10mm)", sku: "SR-10-007", currentStock: 3, rop: 15, eoq: 100, supplier: "SteelWorks Inc.", estimatedCost: "$2,700", leadTime: "5 days", urgency: "critical" },
  { id: "R-003", product: "Canned Tuna 200g", sku: "CT-200-019", currentStock: 120, rop: 100, eoq: 300, supplier: "PackPro", estimatedCost: "$450", leadTime: "4 days", urgency: "low" },
  { id: "R-004", product: "Butter 250g", sku: "BT-250-008", currentStock: 28, rop: 40, eoq: 150, supplier: "OrganicFarms Co.", estimatedCost: "$675", leadTime: "3 days", urgency: "moderate" },
  { id: "R-005", product: "Bolts M8", sku: "BT-M8-012", currentStock: 42, rop: 60, eoq: 500, supplier: "BuildRight Supply", estimatedCost: "$350", leadTime: "7 days", urgency: "moderate" },
];

const urgencyStyles = {
  critical: { label: "Critical", style: "bg-destructive/10 text-destructive" },
  moderate: { label: "Moderate", style: "bg-warning/10 text-warning" },
  low: { label: "Low", style: "bg-success/10 text-success" },
};

export default function ReorderDecisions() {
  const [accepted, setAccepted] = useState(new Set());

  const handleAccept = (id) => {
    setAccepted(prev => new Set(prev).add(id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reorder Decisions</h1>
        <p className="text-sm text-muted-foreground mt-1">System-generated suggestions based on ROP & EOQ calculations.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Critical", count: suggestions.filter(s => s.urgency === "critical").length, icon: AlertTriangle, color: "text-destructive bg-destructive/10" },
          { label: "Moderate", count: suggestions.filter(s => s.urgency === "moderate").length, icon: TrendingUp, color: "text-warning bg-warning/10" },
          { label: "Accepted", count: accepted.size, icon: CheckCircle2, color: "text-success bg-success/10" },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", s.color)}><s.icon size={18} /></div>
            <div>
              <p className="text-xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      <div className="space-y-3">
        {suggestions.map((item, i) => {
          const isAccepted = accepted.has(item.id);
          const urg = urgencyStyles[item.urgency];
          return (
            <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={cn("glass-card rounded-xl p-5 transition-all", isAccepted && "opacity-60 border-success/30")}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full", urg.style)}>{urg.label}</span>
                    <h3 className="font-semibold text-sm">{item.product}</h3>
                    <span className="text-xs font-mono text-muted-foreground">{item.sku}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Current Stock</span>
                      <span className={cn("font-bold", item.currentStock < item.rop ? "text-destructive" : "")}>{item.currentStock}</span>
                      <span className="text-muted-foreground"> / {item.rop} ROP</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Suggested Qty (EOQ)</span>
                      <span className="font-bold">{item.eoq} units</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Est. Cost</span>
                      <span className="font-bold">{item.estimatedCost}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Lead Time</span>
                      <span>{item.leadTime}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Supplier: <span className="text-foreground">{item.supplier}</span></p>
                </div>
                <div className="flex gap-2 sm:flex-col">
                  {isAccepted ? (
                    <div className="flex items-center gap-1.5 text-sm text-success font-medium">
                      <CheckCircle2 size={16} />
                      PO Created
                    </div>
                  ) : (
                    <>
                      <button onClick={() => handleAccept(item.id)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                        <ShoppingCart size={14} />
                        Accept & Order
                      </button>
                      <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors">
                        <RefreshCw size={14} />
                        Adjust
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
