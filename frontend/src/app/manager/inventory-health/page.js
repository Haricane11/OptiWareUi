"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, Clock, TrendingDown, CheckCircle2, XCircle, PlayCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PAGE_SIZE_FLAGGED = 10;
const PAGE_SIZE_ACTIONS = 5;

// Reusable Pagination UI Component
function Pagination({ currentPage, totalItems, pageSize, onPageChange }) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const pages = [];
  const maxShown = 5;
  let start = Math.max(1, currentPage - Math.floor(maxShown / 2));
  let end = Math.min(totalPages, start + maxShown - 1);
  if (end - start + 1 < maxShown) start = Math.max(1, end - maxShown + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button 
        onClick={() => onPageChange(currentPage - 1)} 
        disabled={currentPage === 1}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      
      {start > 1 && (
        <>
          <button onClick={() => onPageChange(1)} className="px-3 py-1 text-sm rounded-md hover:bg-muted text-muted-foreground transition-colors">1</button>
          {start > 2 && <span className="px-1 text-muted-foreground">...</span>}
        </>
      )}
      
      {pages.map(p => (
        <button 
          key={p} 
          onClick={() => onPageChange(p)}
          className={cn("px-3 py-1 text-sm rounded-md font-medium transition-colors", 
            p === currentPage ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted text-muted-foreground"
          )}
        >
          {p}
        </button>
      ))}
      
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-muted-foreground">...</span>}
          <button onClick={() => onPageChange(totalPages)} className="px-3 py-1 text-sm rounded-md hover:bg-muted text-muted-foreground transition-colors">{totalPages}</button>
        </>
      )}

      <button 
        onClick={() => onPageChange(currentPage + 1)} 
        disabled={currentPage === totalPages}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export default function InventoryHealthPage() {
  const [report, setReport] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [flaggedPage, setFlaggedPage] = useState(1);
  const [actionsPage, setActionsPage] = useState(1);

  const fetchHealthData = async () => {
    try {
      const [reportRes, suggRes] = await Promise.all([
        fetch("http://localhost:8000/analytics/health-report"),
        fetch("http://localhost:8000/analytics/action-suggestions?status=PENDING")
      ]);
      if (reportRes.ok) setReport(await reportRes.json());
      if (suggRes.ok) {
        const suggData = await suggRes.json();
        setSuggestions(suggData.suggestions || []);
      }
    } catch (error) {
      console.error("Failed to fetch health data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
  }, []);

  const handleAction = async (id, actionType) => {
    try {
      let endpoint = "";
      let method = "POST";
      let bodyItem = null;

      if (actionType === "approve") {
        endpoint = `http://localhost:8000/analytics/approve-action/${id}`;
        bodyItem = { approved_by: 1 };
      } else if (actionType === "reject") {
        endpoint = `http://localhost:8000/analytics/reject-action/${id}`;
        bodyItem = { reason: "Manager override" };
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyItem)
      });

      if (res.ok) {
        toast.success(`Suggestion ${actionType}d successfully`);
        fetchHealthData();
      } else {
        toast.error(`Failed to ${actionType} suggestion`);
      }
    } catch (error) {
      console.error(`Action ${actionType} failed`, error);
      toast.error("Network error.");
    }
  };

  const handleScan = async () => {
    toast.info("Starting manual health scan...");
    try {
      const res = await fetch("http://localhost:8000/analytics/run-health-scan", { method: "POST" });
      if (res.ok) {
        toast.success("Health scan completed.");
        fetchHealthData();
      }
    } catch (error) {
      toast.error("Failed to run health scan.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Activity className="animate-pulse text-primary h-12 w-12" />
      </div>
    );
  }

  const summary = [
    { label: "Dead Stock", count: report?.dead_stock_count || 0, icon: TrendingDown, color: "text-foreground bg-foreground/10" },
    { label: "Slow Moving", count: report?.slow_moving_count || 0, icon: AlertTriangle, color: "text-warning bg-warning/10" },
    { label: "Expiry Risk", count: report?.expiry_risk_count || 0, icon: Clock, color: "text-destructive bg-destructive/10" },
  ];

  // Combine flagged items and sort by severity
  const allFlaggedItems = [
    ...(report?.dead_stock_items || []).map(i => ({ ...i, flagType: "Dead", style: "bg-foreground/10 text-foreground" })),
    ...(report?.slow_moving_items || []).map(i => ({ ...i, flagType: "Slow", style: "bg-warning/10 text-warning" })),
    ...(report?.expiry_risk_items || []).map(i => ({ ...i, flagType: "Expiry", style: "bg-destructive/10 text-destructive" })),
  ].sort((a, b) => b.severity_score - a.severity_score);

  const paginatedFlagged = allFlaggedItems.slice((flaggedPage - 1) * PAGE_SIZE_FLAGGED, flaggedPage * PAGE_SIZE_FLAGGED);
  const paginatedActions = suggestions.slice((actionsPage - 1) * PAGE_SIZE_ACTIONS, actionsPage * PAGE_SIZE_ACTIONS);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Health Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-driven insights for dead, slow, and expiring stock.</p>
        </div>
        <button
          onClick={handleScan}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Search size={16} /> Run Full Scan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {summary.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass-card rounded-xl p-5 flex items-center gap-4 border-l-4"
            style={{ borderLeftColor: s.label === "Dead Stock" ? "hsl(var(--foreground))" : s.label === "Slow Moving" ? "hsl(var(--warning))" : "hsl(var(--destructive))" }}
          >
            <div className={cn("p-3 rounded-xl", s.color)}>
              <s.icon size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</p>
            </div>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          className="glass-card rounded-xl p-5 flex items-center gap-4 bg-primary/5 border border-primary/20"
        >
          <div className="p-3 rounded-xl bg-primary/20 text-primary">
            <Activity size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold">${report?.total_value_at_risk?.toLocaleString() || "0"}</p>
            <p className="text-xs text-primary uppercase tracking-wider font-semibold">Value at Risk</p>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
        {/* Flagged Items Column */}
        <div className="col-span-2 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="text-warning h-5 w-5" /> Flagged Inventory
          </h3>
          <div className="glass-card rounded-xl p-1 overflow-x-auto min-h-[500px] flex flex-col justify-between">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="py-3 font-medium">Product ID</th>
                  <th className="py-3 font-medium">Warehouse</th>
                  <th className="py-3 font-medium">Severity</th>
                  <th className="py-3 font-medium">Detected</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFlagged.map((item, i) => (
                  <tr key={`${item.flagType}-${i}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full", item.style)}>
                        {item.flagType}
                      </span>
                    </td>
                    <td className="py-3 font-medium">#{item.product_id}</td>
                    <td className="py-3">{item.warehouse_id}</td>
                    <td className="py-3">
                      <span className={cn("font-semibold", 
                        item.flagType === 'Dead' ? 'text-foreground' : 
                        item.flagType === 'Slow' ? 'text-warning' : 'text-destructive'
                      )}>{item.severity_score}</span>/100
                    </td>
                    <td className="py-3 text-muted-foreground">{new Date(item.detected_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                
                {allFlaggedItems.length === 0 && (
                  <tr><td colSpan="5" className="text-center py-12 text-muted-foreground">No flagged items found. Everything looks healthy!</td></tr>
                )}
              </tbody>
            </table>
            
            <div className="p-4 border-t border-border mt-auto">
              <Pagination 
                currentPage={flaggedPage} 
                totalItems={allFlaggedItems.length} 
                pageSize={PAGE_SIZE_FLAGGED} 
                onPageChange={setFlaggedPage} 
              />
            </div>
          </div>
        </div>

        {/* Action Suggestions Sidebar */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="text-primary h-5 w-5" /> Pending Actions
          </h3>
          <div className="flex flex-col gap-3">
            {suggestions.length === 0 ? (
              <div className="glass-card p-6 rounded-xl text-center text-sm text-muted-foreground">
                No pending suggestions require your approval.
              </div>
            ) : (
              <>
                {paginatedActions.map((s, i) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="glass-card p-4 rounded-xl space-y-3 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold uppercase text-primary px-2 py-0.5 bg-primary/10 rounded">
                        {s.suggestion_type}
                      </span>
                      <span className="text-xs text-muted-foreground">Severity: {s.severity_score}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Product #{s.product_id} (WH: {s.warehouse_id})</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                        {s.reasoning}
                      </p>
                    </div>
                    {s.suggested_discount_percent && (
                      <div className="text-xs bg-muted p-2 rounded">
                        Suggested Discount: <span className="font-bold">{s.suggested_discount_percent}%</span>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button 
                        onClick={() => handleAction(s.id, "approve")}
                        className="flex-1 flex justify-center items-center gap-1 bg-success/10 text-success hover:bg-success hover:text-success-foreground px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      >
                        <CheckCircle2 size={14} /> Approve
                      </button>
                      <button 
                        onClick={() => handleAction(s.id, "reject")}
                        className="flex-1 flex justify-center items-center gap-1 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </motion.div>
                ))}
                
                <Pagination 
                  currentPage={actionsPage} 
                  totalItems={suggestions.length} 
                  pageSize={PAGE_SIZE_ACTIONS} 
                  onPageChange={setActionsPage} 
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
