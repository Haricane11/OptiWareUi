"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrainCircuit, Star, Package, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from "recharts";

export default function LogisticsMetricsPage() {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const res = await fetch("http://localhost:8000/analytics/logistics?limit=100");
      if (res.ok) {
        setMetrics(await res.json());
      }
    } catch (error) {
      toast.error("Failed to load logistics metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <BrainCircuit className="animate-pulse text-primary h-12 w-12" />
      </div>
    );
  }

  // Calculate some averges for the summary
  const avgPopularity = metrics.length ? (metrics.reduce((acc, m) => acc + m.item_popularity_score, 0) / metrics.length).toFixed(2) : 0;
  const avgPickingTime = metrics.length ? (metrics.reduce((acc, m) => acc + m.picking_time_seconds, 0) / metrics.length).toFixed(0) : 0;
  const avgEfficiency = metrics.length ? (metrics.reduce((acc, m) => acc + m.layout_efficiency_score, 0) / metrics.length).toFixed(2) : 0;

  // Transform data for scatter plot: x = layout_efficiency_score, y = picking_time_seconds
  const scatterData = metrics.map(m => ({
    x: m.layout_efficiency_score,
    y: m.picking_time_seconds,
    z: m.item_popularity_score || 0.1, // Radius parameter
    name: `Product #${m.product_id}`,
    id: m.product_id
  })).filter(d => d.x != null && d.y != null);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Logistics Machine Learning</h1>
          <p className="text-sm text-muted-foreground mt-1">Advanced operational KPI tracking across the warehouse.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-5 flex items-center gap-4"
        >
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Star size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold">{avgPopularity}</p>
            <p className="text-xs text-muted-foreground uppercase font-semibold">Avg Product Popularity (0-1)</p>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-5 flex items-center gap-4"
        >
          <div className="p-3 rounded-xl bg-destructive/10 text-destructive">
            <Timer size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold">{avgPickingTime}s</p>
            <p className="text-xs text-muted-foreground uppercase font-semibold">Avg Item Picking Time</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-xl p-5 flex items-center gap-4"
        >
          <div className="p-3 rounded-xl bg-success/10 text-success">
            <Package size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold">{avgEfficiency}</p>
            <p className="text-xs text-muted-foreground uppercase font-semibold">Avg Layout Efficiency</p>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
        {/* Chart */}
        <div className="glass-card rounded-xl p-6 flex flex-col items-center">
          <h3 className="w-full text-lg font-semibold mb-4">Efficiency vs. Picking Time</h3>
          <p className="text-xs text-muted-foreground self-start mb-6">Lower picking time & higher layout efficiency are optimal.</p>
          <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis 
                  dataKey="x" 
                  name="Efficiency" 
                  unit="" 
                  axisLine={false} 
                  tickLine={false}
                  domain={[0, 1]}
                  tick={{ fill: "hsl(var(--muted-foreground))" }} 
                />
                <YAxis 
                  dataKey="y" 
                  name="Time" 
                  unit="s" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: "hsl(var(--muted-foreground))" }} 
                />
                <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter name="Products" data={scatterData} fill="hsl(var(--primary))" shape="circle" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Data Table */}
        <div className="glass-card rounded-xl overflow-hidden flex flex-col h-112">
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-semibold">KPI Score Rankings</h3>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card/95 backdrop-blur z-10 border-b border-border">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Product ID</th>
                  <th className="py-3 font-medium">KPI Score</th>
                  <th className="py-3 font-medium">Fulfillment Rate</th>
                </tr>
              </thead>
              <tbody>
                {metrics.sort((a,b) => (b.kpi_score || 0) - (a.kpi_score || 0)).slice(0,50).map((item) => (
                  <tr key={item.product_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">#{item.product_id}</td>
                    <td className="py-3">
                      <span className={cn("px-2 py-0.5 rounded font-bold text-xs", 
                        item.kpi_score > 0.8 ? "bg-success/20 text-success-foreground" : 
                        item.kpi_score < 0.4 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                      )}>
                        {Number(item.kpi_score || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">{Number(item.order_fulfillment_rate || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
