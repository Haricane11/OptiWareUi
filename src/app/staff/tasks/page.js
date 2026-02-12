"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const tasks = [
  { id: 1, product: "Organic Milk (2L)", from: "Dock A", to: "A3-L2", qty: 50, status: "in_progress" },
  { id: 2, product: "Steel Rods (10mm)", from: "Dock B", to: "D2-L3", qty: 200, status: "pending" },
  { id: 3, product: "Fresh Yogurt Pack", from: "Dock A", to: "A1-L1", qty: 80, status: "pending" },
  { id: 4, product: "Bolts M8", from: "Dock B", to: "D1-L1", qty: 500, status: "completed" },
  { id: 5, product: "Canned Tuna 200g", from: "Dock A", to: "B2-L1", qty: 120, status: "completed" },
];

const statusStyles = {
  in_progress: { label: "In Progress", color: "text-primary", icon: Clock },
  pending: { label: "Pending", color: "text-warning", icon: Clock },
  completed: { label: "Done", color: "text-success", icon: CheckCircle2 },
};

export default function StaffTasks() {
  const active = tasks.filter(t => t.status !== "completed");
  const completed = tasks.filter(t => t.status === "completed");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">My Tasks</h2>
        <p className="text-sm text-muted-foreground mt-1">{active.length} pending · {completed.length} completed today</p>
      </div>

      <div className="space-y-2.5">
        {active.map((task, i) => {
          const s = statusStyles[task.status];
          return (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={cn("glass-card rounded-xl p-4", task.status === "in_progress" && "border-primary/30")}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{task.product}</p>
                <span className={`flex items-center gap-1 text-xs font-medium ${s.color}`}>
                  <s.icon size={12} />
                  {s.label}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{task.from}</span>
                <ArrowRight size={10} />
                <span className="font-medium text-foreground">{task.to}</span>
                <span>·</span>
                <span>{task.qty} units</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {completed.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Completed</h3>
          <div className="space-y-2">
            {completed.map((task) => (
              <div key={task.id} className="glass-card rounded-xl p-3.5 opacity-60">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium line-through">{task.product}</p>
                  <CheckCircle2 size={14} className="text-success" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{task.to} · {task.qty} units</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
