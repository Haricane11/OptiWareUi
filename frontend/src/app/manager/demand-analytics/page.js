"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, RefreshCw, BarChart3, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function DemandAnalyticsPage() {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const fetchMetrics = async () => {
    try {
      const res = await fetch("http://localhost:8000/demand/metrics");
      if (res.ok) {
        setMetrics(await res.json());
      }
    } catch (error) {
      toast.error("Failed to load demand metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handleRecalculateAll = async () => {
    setIsRecalculating(true);
    toast.info("Recalculating all demand policies...");
    try {
      const res = await fetch("http://localhost:8000/demand/recalculate-all", { method: "POST" });
      if (res.ok) {
        toast.success("Recalculation complete");
        fetchMetrics();
      } else {
        toast.error("Failed to recalculate policies");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setIsRecalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <TrendingUp className="animate-pulse text-primary h-12 w-12" />
      </div>
    );
  }

  const avgVariance = metrics.length ? (metrics.reduce((acc, m) => acc + m.demand_std_dev, 0) / metrics.length).toFixed(2) : 0;
  const highVarianceCount = metrics.filter(m => m.demand_std_dev > 5).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dynamic Demand Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time demand metrics for optimal reorder parameters.</p>
        </div>
        <button
          onClick={handleRecalculateAll}
          disabled={isRecalculating}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <RefreshCw size={16} className={cn(isRecalculating && "animate-spin")} /> 
          {isRecalculating ? "Recalculating..." : "Recalculate All"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-5 flex items-center gap-4"
        >
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <BarChart3 size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold">{avgVariance}</p>
            <p className="text-xs text-muted-foreground">Average Global Variance (Std Dev)</p>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-5 flex items-center gap-4"
          style={{ borderLeftColor: highVarianceCount > 0 ? "hsl(var(--warning))" : "transparent" }}
        >
          <div className="p-3 rounded-xl bg-warning/10 text-warning">
            <AlertCircle size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold">{highVarianceCount}</p>
            <p className="text-xs text-muted-foreground">Highly Volatile Items (Std Dev &gt; 5)</p>
          </div>
        </motion.div>
      </div>

      <div className="glass-card rounded-xl p-1 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="px-4 py-3 font-medium">Product ID</th>
              <th className="py-3 font-medium">Avg Daily Demand</th>
              <th className="py-3 font-medium">Demand Std Dev</th>
              <th className="py-3 font-medium">Window (Days)</th>
              <th className="py-3 font-medium">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((item, i) => (
              <tr key={item.product_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">#{item.product_id}</td>
                <td className="py-3 font-semibold text-primary">{item.average_daily_demand.toFixed(2)}</td>
                <td className="py-3">
                  <span className={item.demand_std_dev > 5 ? "text-warning font-bold" : "text-muted-foreground"}>
                    {item.demand_std_dev.toFixed(2)}
                  </span>
                </td>
                <td className="py-3 text-muted-foreground">{item.window_days}</td>
                <td className="py-3 text-muted-foreground">{new Date(item.last_updated).toLocaleString()}</td>
              </tr>
            ))}
            {metrics.length === 0 && (
              <tr><td colSpan="5" className="text-center py-6 text-muted-foreground">No metrics found. Run recalculate!</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
