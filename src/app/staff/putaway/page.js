"use client";

import { motion } from "framer-motion";
import { Navigation, ScanLine, ArrowRight, MapPin } from "lucide-react";

const tasks = [
  { id: 1, product: "Organic Milk (2L)", from: "Dock A", to: "A3-L2", distance: "42m", priority: "high" },
  { id: 2, product: "Steel Rods (10mm)", from: "Dock B", to: "D2-L3", distance: "78m", priority: "normal" },
  { id: 3, product: "Fresh Yogurt Pack", heart: "Dock A", to: "A1-L1", distance: "28m", priority: "high" },
];

export default function StaffPutaway() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Put-away</h2>
        <p className="text-sm text-muted-foreground mt-1">Follow navigation to place items on shelves.</p>
      </div>

      {/* Active navigation */}
      <div className="glass-card-elevated rounded-2xl p-5 border-primary/30">
        <div className="flex items-center gap-2 text-xs text-primary font-semibold mb-3">
          <Navigation size={14} />
          ACTIVE ROUTE
        </div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-bold text-lg">Organic Milk (2L)</p>
            <p className="text-sm text-muted-foreground">50 units · 45kg</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm bg-muted/50 rounded-xl p-3">
          <div className="text-center">
            <MapPin size={16} className="mx-auto text-muted-foreground mb-0.5" />
            <span className="font-mono text-xs">Dock A</span>
          </div>
          <div className="flex-1 border-t-2 border-dashed border-primary/40 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] text-primary font-medium bg-background px-1.5">42m</span>
          </div>
          <div className="text-center">
            <MapPin size={16} className="mx-auto text-primary mb-0.5" />
            <span className="font-mono text-xs font-bold text-primary">A3-L2</span>
          </div>
        </div>

        {/* Scan buttons */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 text-primary font-medium text-sm"
          >
            <ScanLine size={16} />
            Scan Product
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 text-primary font-medium text-sm"
          >
            <ScanLine size={16} />
            Scan Shelf
          </motion.button>
        </div>
      </div>

      {/* Queue */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Pending Tasks ({tasks.length})</h3>
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="glass-card rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {task.priority === "high" && <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />}
                {task.priority === "normal" && <span className="w-2 h-2 rounded-full bg-primary" />}
                <div>
                  <p className="text-sm font-medium">{task.product}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {task.from} <ArrowRight size={10} /> {task.to} · {task.distance}
                  </p>
                </div>
              </div>
              <button className="text-xs font-medium text-primary px-3 py-1.5 rounded-lg bg-primary/10">
                Start
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
