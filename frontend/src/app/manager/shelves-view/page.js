"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const zones = [
  { id: "A", rows: 4, cols: 6, products: [
    { row: 0, col: 0, name: "Fresh Yogurt", pct: 90 },
    { row: 0, col: 1, name: "Organic Milk", pct: 25 },
    { row: 0, col: 2, name: "Butter 250g", pct: 60 },
    { row: 1, col: 0, name: "Cheese Block", pct: 45 },
    { row: 1, col: 3, name: "Cream 500ml", pct: 78 },
    { row: 2, col: 1, name: "Eggs Pack", pct: 55 },
    { row: 2, col: 4, name: "Juice 1L", pct: 100 },
    { row: 3, col: 0, name: "Water 6pk", pct: 30 },
  ]},
  { id: "B", rows: 4, cols: 6, products: [
    { row: 0, col: 0, name: "Canned Tuna", pct: 85 },
    { row: 0, col: 2, name: "Rice 5kg", pct: 70 },
    { row: 1, col: 1, name: "Pasta 500g", pct: 40 },
    { row: 2, col: 3, name: "Olive Oil", pct: 95 },
    { row: 3, col: 5, name: "Sugar 1kg", pct: 15 },
  ]},
  { id: "C", rows: 3, cols: 6, products: [
    { row: 0, col: 0, name: "Screen Pro", pct: 100 },
    { row: 0, col: 4, name: "USB Hub", pct: 90 },
    { row: 1, col: 2, name: "Cables", pct: 50 },
    { row: 2, col: 1, name: "Batteries", pct: 35 },
  ]},
  { id: "D", rows: 3, cols: 6, products: [
    { row: 0, col: 0, name: "Steel Rods", pct: 20 },
    { row: 0, col: 3, name: "Bolts M8", pct: 65 },
    { row: 1, col: 1, name: "Nuts M6", pct: 80 },
    { row: 2, col: 5, name: "Washers", pct: 55 },
  ]},
];

const getColor = (pct) => {
  if (pct === 0) return "bg-muted";
  if (pct <= 30) return "bg-success/30";
  if (pct <= 60) return "bg-primary/30";
  if (pct <= 80) return "bg-primary/50";
  return "bg-primary/80";
};

export default function ShelvesView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shelves View</h1>
        <p className="text-sm text-muted-foreground mt-1">2D warehouse map showing shelf occupancy.</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-muted" /> Empty</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-success/30" /> 1-30%</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary/30" /> 31-60%</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary/50" /> 61-80%</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary/80" /> 81-100%</span>
      </div>

      {/* Zones */}
      <div className="grid md:grid-cols-2 gap-6">
        {zones.map((zone) => (
          <motion.div
            key={zone.id}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card rounded-xl p-5"
          >
            <h3 className="font-semibold text-sm mb-3">Zone {zone.id}</h3>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${zone.cols}, 1fr)` }}>
              {Array.from({ length: zone.rows * zone.cols }).map((_, idx) => {
                const row = Math.floor(idx / zone.cols);
                const col = idx % zone.cols;
                const product = zone.products.find(p => p.row === row && p.col === col);
                return (
                  <div
                    key={idx}
                    className={cn(
                      "aspect-square rounded-md flex items-center justify-center text-[8px] font-medium cursor-default transition-all hover:ring-1 hover:ring-primary/40",
                      product ? getColor(product.pct) : "bg-muted/50"
                    )}
                    title={product ? `${product.name} — ${product.pct}%` : "Empty"}
                  >
                    {product && <span className="truncate px-0.5 text-foreground/70">{product.pct}%</span>}
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
