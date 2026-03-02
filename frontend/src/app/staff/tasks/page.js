"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const statusStyles = {
  in_progress: { label: "In Progress", color: "text-primary", icon: Clock },
  pending: { label: "Pending", color: "text-warning", icon: Clock },
  completed: { label: "Done", color: "text-success", icon: CheckCircle2 },
};

function apiBase() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

export default function StaffTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTasks = async () => {
    try {
      setLoading(true);
      // Only Inbound team sees placement suggestions as tasks
      if (user?.team !== "Inbound") {
        setTasks([]);
        return;
      }

      const res = await fetch(`${apiBase()}/receiving/placement-suggestions`);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      
      // Map placement suggestions to task format
      const mapped = data.map(s => ({
        id: s.suggestion_id,
        product: `${s.product_name} (${s.sku})`,
        from: s.po_number ? `PO: ${s.po_number}` : "Receiving Area",
        to: s.shelf_code,
        qty: s.suggested_qty,
        status: s.status === "pending" ? "pending" : "completed"
      }));
      
      setTasks(mapped);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadTasks();
  }, [user]);

  const active = tasks.filter(t => t.status !== "completed");
  const completed = tasks.filter(t => t.status === "completed");

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="text-sm font-medium">Loading your tasks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">My Tasks</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.team ? `${user.team} Team` : "No team assigned"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-primary">{active.length} ACTIVE</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{completed.length} DONE</p>
        </div>
      </div>

      {user?.team !== "Inbound" && (
        <div className="glass-card rounded-2xl p-8 text-center border-dashed border-2 border-border/50">
          <div className="mx-auto w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mb-4 text-muted-foreground">
            <Clock size={24} />
          </div>
          <h3 className="font-semibold text-foreground">No Inbound Tasks</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-[240px] mx-auto">
            Tasks in this view are currently managed for the Inbound team only.
          </p>
        </div>
      )}

      {user?.team === "Inbound" && active.length === 0 && (
        <div className="glass-card rounded-2xl p-8 text-center border-dashed border-2 border-border/50">
          <CheckCircle2 className="mx-auto text-success mb-3" size={32} />
          <h3 className="font-semibold text-foreground">You're all caught up!</h3>
          <p className="text-sm text-muted-foreground mt-1">No pending placement tasks.</p>
        </div>
      )}

      <div className="space-y-3">
        {active.map((task, i) => {
          const s = statusStyles[task.status];
          return (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                "glass-card rounded-2xl p-5 border border-border/50 hover:border-primary/30 transition-all shadow-sm",
                task.status === "in_progress" && "border-primary/40 bg-primary/5"
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-bold text-base leading-tight">{task.product}</p>
                  <p className="text-xs text-muted-foreground mt-1">{task.qty} units to move</p>
                </div>
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  task.status === "pending" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
                )}>
                  {s.label}
                </span>
              </div>

              <div className="flex items-center gap-4 bg-muted/30 p-3 rounded-xl border border-border/50">
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">From</p>
                  <p className="text-sm font-medium">{task.from}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center border border-border">
                  <ArrowRight size={14} className="text-primary" />
                </div>
                <div className="flex-1 text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">To Shelf</p>
                  <p className="text-sm font-bold text-primary">{task.to}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {completed.length > 0 && (
        <div className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border/50" />
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Recently Completed</h3>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <div className="space-y-2">
            {completed.map((task) => (
              <div key={task.id} className="glass-card rounded-xl p-4 opacity-75 grayscale-[0.5] border border-border/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-muted-foreground line-through">{task.product}</p>
                  <CheckCircle2 size={16} className="text-success/50" />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[11px] text-muted-foreground">Moved to <span className="font-bold">{task.to}</span></p>
                  <p className="text-[11px] font-medium">{task.qty} units</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
