"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Clock, Package, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const stockData = [
  { type: "low", product: "Organic Milk (2L)", sku: "OM-2L-001", shelf: "A3-L2", current: 5, min: 20, risk: "$450", days: 5 },
  { type: "dead", product: "Screen Protector X", sku: "SP-X-042", shelf: "C1-L4", current: 210, min: 50, risk: "$2,100", days: 180 },
  { type: "expiring", product: "Fresh Yogurt Pack", sku: "FY-P-033", shelf: "A1-L1", current: 80, min: 30, risk: "$320", days: 12 },
  { type: "low", product: "Steel Rods (10mm)", sku: "SR-10-007", shelf: "D2-L3", current: 3, min: 15, risk: "$5,000", days: null },
  { type: "expiring", product: "Canned Tuna 200g", sku: "CT-200-019", shelf: "B2-L1", current: 120, min: 40, risk: "$180", days: 28 },
  { type: "dead", product: "USB-C Hub v1", sku: "UC-H1-055", shelf: "C3-L2", current: 45, min: 10, risk: "$675", days: 240 },
];

const summary = [
  { label: "Low Stock", count: 2, icon: AlertTriangle, color: "text-destructive bg-destructive/10" },
  { label: "Expiring < 30d", count: 2, icon: Clock, color: "text-warning bg-warning/10" },
  { label: "Dead Stock", count: 2, icon: TrendingDown, color: "text-foreground bg-foreground/10" },
];

const typeStyles = {
  low: "bg-destructive/10 text-destructive",
  dead: "bg-foreground/10 text-foreground",
  expiring: "bg-warning/10 text-warning",
};

const rowHighlight = {
  low: "border-l-2 border-l-destructive",
  dead: "border-l-2 border-l-foreground/30",
  expiring: "border-l-2 border-l-warning",
};

export default function StockMonitor() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stock Monitor</h1>
        <p className="text-sm text-muted-foreground mt-1">Track alerts for low, expiring, and dead stock items.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summary.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass-card rounded-xl p-5 flex items-center gap-4"
          >
            <div className={cn("p-3 rounded-xl", s.color)}>
              <s.icon size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="pb-3 font-medium">Alert</th>
              <th className="pb-3 font-medium">Product</th>
              <th className="pb-3 font-medium">SKU</th>
              <th className="pb-3 font-medium">Shelf</th>
              <th className="pb-3 font-medium">Current / Min</th>
              <th className="pb-3 font-medium">Capital at Risk</th>
              <th className="pb-3 font-medium">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {stockData.map((item, i) => (
              <tr key={i} className={cn("border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors", rowHighlight[item.type])}>
                <td className="py-3">
                  <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full", typeStyles[item.type])}>
                    {item.type === "low" ? "🔴 Low" : item.type === "dead" ? "⚫ Dead" : "🟡 Expiry"}
                  </span>
                </td>
                <td className="py-3 font-medium">{item.product}</td>
                <td className="py-3 font-mono text-xs text-muted-foreground">{item.sku}</td>
                <td className="py-3">{item.shelf}</td>
                <td className="py-3">
                  <span className={cn(item.current < item.min ? "text-destructive font-semibold" : "")}>
                    {item.current}
                  </span>
                  <span className="text-muted-foreground"> / {item.min}</span>
                </td>
                <td className="py-3 font-semibold text-destructive">{item.risk}</td>
                <td className="py-3 text-muted-foreground">
                  {item.days !== null ? (
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {item.days}d
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
