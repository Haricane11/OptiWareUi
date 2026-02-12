"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Layers, Ruler, Weight, Trash2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const initialShelves = [
  { id: "A1", zone: "A", row: 1, col: 1, levels: 4, maxWeight: 500, depth: 80, width: 120, height: 240, type: "cold" },
  { id: "A2", zone: "A", row: 1, col: 2, levels: 4, maxWeight: 500, depth: 80, width: 120, height: 240, type: "cold" },
  { id: "A3", zone: "A", row: 1, col: 3, levels: 3, maxWeight: 400, depth: 80, width: 120, height: 200, type: "standard" },
  { id: "B1", zone: "B", row: 2, col: 1, levels: 5, maxWeight: 600, depth: 100, width: 150, height: 300, type: "standard" },
  { id: "B2", zone: "B", row: 2, col: 2, levels: 5, maxWeight: 600, depth: 100, width: 150, height: 300, type: "standard" },
  { id: "C1", zone: "C", row: 3, col: 1, levels: 3, maxWeight: 300, depth: 60, width: 100, height: 180, type: "standard" },
  { id: "C3", zone: "C", row: 3, col: 3, levels: 4, maxWeight: 400, depth: 80, width: 120, height: 240, type: "standard" },
  { id: "D1", zone: "D", row: 4, col: 1, levels: 3, maxWeight: 1000, depth: 120, width: 180, height: 200, type: "heavy" },
  { id: "D2", zone: "D", row: 4, col: 2, levels: 3, maxWeight: 1000, depth: 120, width: 180, height: 200, type: "heavy" },
];

const typeStyles = {
  standard: "bg-primary/10 text-primary",
  cold: "bg-blue-500/10 text-blue-600",
  heavy: "bg-warning/10 text-warning",
  hazardous: "bg-destructive/10 text-destructive",
};

export default function ShelvesLayout() {
  const [shelves] = useState(initialShelves);
  const [selectedZone, setSelectedZone] = useState(null);

  const zones = Array.from(new Set(shelves.map(s => s.zone)));
  const filtered = selectedZone ? shelves.filter(s => s.zone === selectedZone) : shelves;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shelves Layout</h1>
          <p className="text-sm text-muted-foreground mt-1">Define and manage shelf dimensions, zones, and capacity.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-medium shadow-sm hover:opacity-90 transition-opacity w-fit">
          <Plus size={16} />
          Add Shelf
        </button>
      </div>

      {/* Zone filter */}
      <div className="flex flex-wrap items-center gap-2">
        <button 
          onClick={() => setSelectedZone(null)} 
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
            !selectedZone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          All Zones
        </button>
        {zones.map(z => (
          <button 
            key={z} 
            onClick={() => setSelectedZone(z)} 
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
              selectedZone === z ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            Zone {z}
          </button>
        ))}
      </div>

      {/* Shelf cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((shelf, i) => (
          <motion.div 
            key={shelf.id} 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: i * 0.04 }}
            className="glass-card rounded-xl p-4 space-y-3 hover:border-primary/30 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Layers size={16} className="text-primary" />
                </div>
                <div>
                  <p className="font-bold text-sm">Shelf {shelf.id}</p>
                  <p className="text-[10px] text-muted-foreground">Zone {shelf.zone}</p>
                </div>
              </div>
              <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full", typeStyles[shelf.type])}>{shelf.type}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/50 rounded-lg px-3 py-2 flex items-center gap-2">
                <Layers size={12} className="text-muted-foreground" />
                <span>{shelf.levels} levels</span>
              </div>
              <div className="bg-muted/50 rounded-lg px-3 py-2 flex items-center gap-2">
                <Weight size={12} className="text-muted-foreground" />
                <span>{shelf.maxWeight}kg max</span>
              </div>
              <div className="bg-muted/50 rounded-lg px-3 py-2 flex items-center gap-2">
                <Ruler size={12} className="text-muted-foreground" />
                <span>{shelf.width}×{shelf.depth}cm</span>
              </div>
              <div className="bg-muted/50 rounded-lg px-3 py-2 flex items-center gap-2">
                <Ruler size={12} className="text-muted-foreground" />
                <span>H: {shelf.height}cm</span>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                <Save size={12} /> Edit
              </button>
              <button className="flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
