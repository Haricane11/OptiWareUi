"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

const getHeatColor = (pct) => {
  if (pct === 0) return "bg-muted/30";
  if (pct <= 30) return "bg-primary/15";
  if (pct <= 60) return "bg-primary/30";
  if (pct <= 80) return "bg-primary/55";
  return "bg-primary/85";
};

export default function StaffMap() {
  // Use useMemo to prevent re-randomizing on every render
  const grid = useMemo(() => 
    Array.from({ length: 8 }, (_, row) =>
      Array.from({ length: 10 }, (_, col) => {
        const random = Math.random();
        const pct = random < 0.15 ? 0 : Math.floor(random * 100);
        return { row, col, pct };
      })
    ).flat(), 
  []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Warehouse Map</h2>
        <p className="text-sm text-muted-foreground mt-1">Real-time shelf occupancy heatmap.</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-muted/30" /> Empty</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-primary/15" /> Low</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-primary/55" /> Medium</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-primary/85" /> Full</span>
      </div>

      {/* Map grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card rounded-xl p-4"
      >
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(10, 1fr)" }}>
          {grid.map((cell, idx) => (
            <div
              key={idx}
              className={cn(
                "aspect-square rounded-sm flex items-center justify-center text-[7px] font-medium cursor-default transition-all hover:ring-1 hover:ring-primary/50",
                getHeatColor(cell.pct)
              )}
              title={`Row ${cell.row + 1}, Col ${cell.col + 1}: ${cell.pct}%`}
            >
              {cell.pct > 0 && <span className="text-foreground/50">{cell.pct}</span>}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-3 text-[10px] text-muted-foreground">
          <span>← Entry / Dock</span>
          <span>Storage Rear →</span>
        </div>
      </motion.div>

      {/* Overall stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Shelves", value: "80" },
          { label: "Occupied", value: "68" },
          { label: "Avg Usage", value: "72%" },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-xl p-3 text-center">
            <p className="text-lg font-bold">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
