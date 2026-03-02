"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign, Tag, Package, RotateCcw, Trash2, TrendingDown,
  Loader2, ChevronLeft, ChevronRight, Search, Check, Play,
  RefreshCw, ChevronDown, Clock, History, ShoppingCart, AlertTriangle,
  ArrowRight, Info, CheckSquare, Square, XCircle, ArrowUpRight, ArrowDownRight, Minus
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const PAGE_SIZE = 50; // Increased since it's an analytics dashboard now

// ─── Pagination ──────────────────────────────────────────────────────────────
function PaginationControls({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  const pages = [];
  const maxShown = 5;
  let start = Math.max(1, currentPage - Math.floor(maxShown / 2));
  let end = Math.min(totalPages, start + maxShown - 1);
  if (end - start + 1 < maxShown) start = Math.max(1, end - maxShown + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1 pt-4 border-t border-border/30">
      <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors">
        <ChevronLeft size={16} />
      </button>
      {start > 1 && (<>
        <button onClick={() => onPageChange(1)} className="w-8 h-8 flex items-center justify-center text-xs rounded-md text-muted-foreground hover:bg-muted/50 transition-colors">1</button>
        {start > 2 && <span className="text-muted-foreground/40 text-xs px-0.5">…</span>}
      </>)}
      {pages.map(p => (
        <button key={p} onClick={() => onPageChange(p)}
          className={cn("w-8 h-8 flex items-center justify-center text-xs rounded-md transition-colors",
            p === currentPage ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted/50")}>
          {p}
        </button>
      ))}
      {end < totalPages && (<>
        {end < totalPages - 1 && <span className="text-muted-foreground/40 text-xs px-0.5">…</span>}
        <button onClick={() => onPageChange(totalPages)} className="w-8 h-8 flex items-center justify-center text-xs rounded-md text-muted-foreground hover:bg-muted/50 transition-colors">{totalPages}</button>
      </>)}
      <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const typeIcon = { DISCOUNT: Tag, BUNDLE: Package, RETURN: RotateCcw, DISPOSAL: Trash2 };
const typeLabel = { DISCOUNT: "Discount", BUNDLE: "Bundle Strategy", RETURN: "Return", DISPOSAL: "Disposal" };
const typeColor = {
  DISCOUNT: "text-warning bg-warning/10 border-warning/20",
  BUNDLE: "text-primary bg-primary/10 border-primary/20",
  RETURN: "text-primary bg-primary/10 border-primary/20",
  DISPOSAL: "text-destructive bg-destructive/10 border-destructive/20",
};

const actionOutcome = {
  DISCOUNT: {
    label: "Discount",
    proceed: "A promotional discount will be automatically created for this product. Recovers capital from price-elastic overstock.",
    icon: Tag,
  },
  BUNDLE: {
    label: "Bundle Strategy",
    proceed: "Pairs this product with a complementary fast-moving item. High margin preservation for Slow-Moving items.",
    icon: Package,
  },
  RETURN: {
    label: "Supplier Return",
    proceed: "Initiates a formal return-to-supplier request based on SLA terms.",
    icon: RotateCcw,
  },
  DISPOSAL: {
    label: "Disposal / Write-off",
    proceed: "Item marked for disposal. Inventory zeroes out, finalizes financial loss, clears physical shelf space. Used for low margin capital traps.",
    icon: Trash2,
  },
  NONE: {
    label: "Monitor",
    proceed: "Item is tracking normally. No immediate intervention required. Maintain current reorder strategy.",
    icon: Check
  }
};

function formatCurrency(v) {
  return `$${(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Visual Components ───────────────────────────────────────────────────────
function SeverityBadge({ current, previous }) {
  const cur = current ?? 0;
  const prev = previous ?? cur;
  let colorClass = "bg-success text-success-foreground";
  let label = "Healthy";
  
  if (cur >= 2.0) {
    colorClass = "bg-destructive text-destructive-foreground";
    label = "Dead";
  } else if (cur >= 1.0) {
    colorClass = "bg-warning text-warning-foreground";
    label = "Slow";
  }
  
  const delta = cur - prev;
  const isWorse = delta > 0.05;
  const isBetter = delta < -0.05;
  
  return (
    <div className="flex flex-col gap-1 w-[80px]">
      <div className={cn("text-xs font-bold px-2 py-0.5 rounded flex items-center justify-between", colorClass)}>
        <span>{cur.toFixed(2)}</span>
      </div>
      <div className="flex items-center text-[10px] text-muted-foreground font-medium pl-0.5">
        {isWorse ? <ArrowUpRight size={10} className="text-destructive mr-0.5"/> : 
         isBetter ? <ArrowDownRight size={10} className="text-success mr-0.5"/> : 
         <Minus size={10} className="mr-0.5"/>}
        {Math.abs(delta).toFixed(2)}
      </div>
    </div>
  );
}

function MiniProgressBar({ value, max, label, colorClass }) {
  const val = value ?? 0;
  const pct = Math.min(100, Math.max(0, (val / max) * 100));
  return (
    <div className="flex flex-col gap-1 w-full max-w-[100px]">
      <div className="flex justify-between text-[10px] text-muted-foreground leading-none">
        <span>{label}</span>
        <span className="font-semibold">{val.toFixed(1)}{max === 10 ? 'x' : ''}</span>
      </div>
      <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
        <div className={cn("h-full rounded-full transition-all", colorClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function InventoryRiskDashboard() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("severity_score");
  const [sortOrder, setSortOrder] = useState("desc");
  const [scanning, setScanning] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // Portfolio aggregates
  const [portfolioStats, setPortfolioStats] = useState({
    totalAtRisk: 0, deadCapital: 0, slowCapital: 0,
    avgVelocity: 0, avgOverstock: 0, healthyPct: 0, slowPct: 0, deadPct: 0
  });

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Backend automatically supports sorting
      let url = `${API}/inventory-health/?sort_by=${sortBy}&order=${sortOrder}`;
      const res = await fetch(url);
      const data = await res.json();
      
      setItems(data);
      
      // Calculate Portfolio Metrics
      let deadCap = 0, slowCap = 0;
      let sumVelocity = 0, sumOverstock = 0;
      let counts = { HEALTHY: 0, SLOW_MOVING: 0, DEAD: 0 };
      
      data.forEach(item => {
        const cap = (item.total_available ?? 0) * (item.unit_price ?? 0);
        if (item.classification === "DEAD") deadCap += cap;
        if (item.classification === "SLOW_MOVING") slowCap += cap;
        
        counts[item.classification] = (counts[item.classification] || 0) + 1;
        sumVelocity += (item.velocity_score ?? 0);
        sumOverstock += (item.overstock_ratio ?? 0);
      });
      
      const total = data.length || 1;
      setPortfolioStats({
        totalAtRisk: deadCap + slowCap,
        deadCapital: deadCap,
        slowCapital: slowCap,
        avgVelocity: sumVelocity / total,
        avgOverstock: sumOverstock / total,
        healthyPct: (counts.HEALTHY / total) * 100,
        slowPct: (counts.SLOW_MOVING / total) * 100,
        deadPct: (counts.DEAD / total) * 100
      });
      
    } catch (e) {
      console.error("Health fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [sortBy, sortOrder]);

  const runScan = async () => {
    setScanning(true);
    try {
      await fetch(`${API}/inventory-health/recalculate-all`, { method: "POST" });
      await fetchAll();
      setPage(1);
    } catch (e) { console.error(e); }
    setScanning(false);
  };

  // ─── Frontend Filtering & Pagination
  const filteredItems = items.filter(item => {
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase()) && !item.sku.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    
    if (statusFilter === "all") return true;
    if (statusFilter === "Stabilizing") return item.consecutive_confirmation_count > 0 && item.consecutive_confirmation_count < 2;
    if (statusFilter === "Healthy") return item.classification === "HEALTHY";
    if (statusFilter === "Slow") return item.classification === "SLOW_MOVING";
    if (statusFilter === "Dead") return item.classification === "DEAD";
    return true;
  });

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const displayed = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortOrder("desc"); // Default to high->low for risk metrics
    }
  };

  const handlePageChange = (pg) => { setPage(pg); };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectableIds = displayed.map(s => s.product_id);
    const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        selectableIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        selectableIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const doBatchAction = async () => {
    // In a real app, this would dispatch bulk action suggestions
    setBatchLoading(true);
    setTimeout(() => {
        alert(`Executed bulk strategy for ${selectedIds.size} items!`);
        setSelectedIds(new Set());
        setBatchLoading(false);
    }, 1000);
  };

  const getSortIcon = (field) => {
    if (sortBy !== field) return <span className="text-muted-foreground/30 opacity-0 group-hover:opacity-100">↕</span>;
    return sortOrder === "desc" ? <span className="text-primary">↓</span> : <span className="text-primary">↑</span>;
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Risk Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Portfolio mathematical classification, risk weighting, and automated recovery strategies.</p>
        </div>
        <button onClick={runScan} disabled={scanning}
          className={cn("flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm",
            scanning
              ? "bg-muted text-muted-foreground"
              : "bg-primary text-white hover:bg-primary/90")}>
          <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Recalculating Rules…" : "Force Recalculate"}
        </button>
      </div>

      {/* Capital Efficiency Insight Panel */}
      <div className="flex flex-col md:flex-row w-full gap-4">
        {/* Financial Risk Aggregates */}
        <div className="flex flex-col sm:flex-row flex-1 gap-4">
            <div className="flex-1 bg-card shadow-sm border border-border/50 rounded-xl p-4 border-l-4 border-l-destructive flex flex-col justify-center">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Total At Risk</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(portfolioStats.totalAtRisk)}</p>
            </div>
            <div className="flex-1 bg-card shadow-sm border border-border/50 rounded-xl p-4 flex flex-col justify-between">
              <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Dead Capital</p>
                  <p className="text-xl font-bold text-destructive">{formatCurrency(portfolioStats.deadCapital)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 leading-tight">Zero demand traps &gt;90 days</p>
            </div>
            <div className="flex-1 bg-card shadow-sm border border-border/50 rounded-xl p-4 flex flex-col justify-between">
              <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Slow Capital</p>
                  <p className="text-xl font-bold text-warning">{formatCurrency(portfolioStats.slowCapital)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 leading-tight">Poor turnover drag</p>
            </div>
        </div>
        
        {/* Portfolio Averages */}
        <div className="w-full md:w-1/3 bg-card shadow-sm border border-border/50 rounded-xl p-4 flex flex-col justify-between">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Portfolio Averages</p>
            <div className="space-y-3">
                <MiniProgressBar value={portfolioStats.avgVelocity} max={1.0} label="Avg Velocity" colorClass="bg-primary" />
                <MiniProgressBar value={portfolioStats.avgOverstock} max={10.0} label="Avg Overstock Pressure" colorClass="bg-warning" />
            </div>
        </div>
      </div>

      {/* Capital Segmentation Chart */}
      {items.length > 0 && (
         <div className="bg-card shadow-sm border border-border/50 rounded-xl px-5 py-4 w-full">
            <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-2">
                <span>Capital Distribution by Risk Tier</span>
            </div>
            <div className="flex w-full h-3 rounded-full overflow-hidden bg-muted">
                <div className="bg-success" title={`Healthy: ${portfolioStats.healthyPct.toFixed(1)}%`} style={{ width: `${portfolioStats.healthyPct}%` }} />
                <div className="bg-warning" title={`Slow: ${portfolioStats.slowPct.toFixed(1)}%`} style={{ width: `${portfolioStats.slowPct}%` }} />
                <div className="bg-destructive" title={`Dead: ${portfolioStats.deadPct.toFixed(1)}%`} style={{ width: `${portfolioStats.deadPct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] mt-2 font-medium w-full">
                <span className="text-success">{portfolioStats.healthyPct.toFixed(0)}% Healthy</span>
                <span className="text-destructive">{portfolioStats.deadPct.toFixed(0)}% Dead</span>
            </div>
         </div>
      )}

      {/* Main Panel */}
      <div className="bg-card shadow-sm border border-border/50 rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-border/50 bg-muted/10">
            <div className="flex items-center gap-2">
              {["all", "Healthy", "Slow", "Dead", "Stabilizing"].map(st => {
                const isActive = statusFilter === st;
                const activeStyle = "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30";
                
                return (
                  <button key={st} onClick={() => { setStatusFilter(st); setPage(1); }}
                    className={cn("text-xs px-3 py-1.5 rounded-lg font-semibold transition-all",
                      isActive
                        ? activeStyle
                        : "text-muted-foreground hover:bg-muted/80")}>
                    {st === "all" ? "All" : st}
                  </button>
                );
              })}
            </div>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input type="text" placeholder="Search by SKU or Name…" value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow" />
            </div>
          </div>

          {/* Batch action bar */}
          <AnimatePresence>
            {selectedIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between gap-4 px-5 py-3 bg-primary/10 border-b border-primary/20"
                >
                  <div className="flex items-center gap-2">
                    <CheckSquare size={15} className="text-primary" />
                    <span className="text-sm font-semibold text-primary">{selectedIds.size} items selected</span>
                    <button onClick={() => setSelectedIds(new Set())} className="text-xs text-primary/70 hover:text-primary ml-1 transition-colors">Clear</button>
                  </div>
                  <button onClick={doBatchAction} disabled={batchLoading}
                    className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-md bg-primary text-white transition-all hover:bg-primary/90 hover:shadow-md disabled:opacity-50">
                    {batchLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    Execute Bulk Strategy
                  </button>
                </motion.div>
            )}
          </AnimatePresence>

          {/* Table */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="animate-spin mb-4" size={28} />
              <span className="text-sm font-medium">Crunching portfolio risk metrics...</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 1000 }}>
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-muted/5">
                      <th className="px-3 py-3" style={{ width: "3%" }}>
                        <button onClick={e => { e.stopPropagation(); toggleSelectAll(); }} className="text-muted-foreground hover:text-foreground">
                            {displayed.length > 0 && displayed.every(s => selectedIds.has(s.product_id))
                              ? <CheckSquare size={15} className="text-primary" />
                              : <Square size={15} />}
                        </button>
                      </th>
                      <th className="px-2 py-3" style={{ width: "3%" }}></th>
                      
                      <th className="px-3 py-3 cursor-pointer group hover:text-foreground" style={{ width: "12%" }} onClick={() => toggleSort('severity_score')}>
                         Severity Gauge {getSortIcon('severity_score')}
                      </th>
                      <th className="px-3 py-3" style={{ width: "22%" }}>Product</th>
                      
                      <th className="px-3 py-3 cursor-pointer group hover:text-foreground" style={{ width: "12%" }} onClick={() => toggleSort('velocity')}>
                         Velocity {getSortIcon('velocity')}
                      </th>
                      <th className="px-3 py-3 cursor-pointer group hover:text-foreground" style={{ width: "12%" }} onClick={() => toggleSort('overstock')}>
                         Overstock {getSortIcon('overstock')}
                      </th>
                      
                      <th className="px-3 py-3 cursor-pointer group hover:text-foreground" style={{ width: "12%" }} onClick={() => toggleSort('capital')}>
                         Capital Risk {getSortIcon('capital')}
                      </th>
                      <th className="px-4 py-3" style={{ width: "14%" }}>Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((s, i) => {
                      const Icon = typeIcon[s.recommended_action] || Check;
                      const outcome = actionOutcome[s.recommended_action] || actionOutcome.NONE;
                      const isExpanded = expandedRow === s.product_id;
                      
                      const cost = s.unit_price * 0.5; // Demo logic matching backend
                      const totalCap = s.total_available * s.unit_price;
                      // 30% recovery estimate for DEAD
                      const recoveryVal = s.classification === "DEAD" ? s.total_available * cost * 0.3 : totalCap * 0.8;
                      
                      return (
                        <React.Fragment key={s.product_id}>
                          <motion.tr
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.2) }}
                            onClick={() => setExpandedRow(isExpanded ? null : s.product_id)}
                            className={cn("border-b border-border/40 last:border-0 cursor-pointer transition-colors align-middle",
                              selectedIds.has(s.product_id) ? "bg-primary/5 dark:bg-primary/10" : isExpanded ? "bg-muted/30" : "hover:bg-muted/10"
                            )}>
                            
                            <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                                <button onClick={() => toggleSelect(s.product_id)} className="text-muted-foreground hover:text-foreground mt-1">
                                  {selectedIds.has(s.product_id) ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}
                                </button>
                            </td>
                            <td className="px-2 py-4">
                              <ChevronDown size={14} className={cn("text-muted-foreground/40 transition-transform mt-1", isExpanded && "rotate-180 text-foreground")} />
                            </td>
                            
                            <td className="px-3 py-4">
                                <SeverityBadge current={s.severity_score} previous={s.previous_severity_score} />
                            </td>
                            
                            <td className="px-3 py-4">
                              <p className="font-semibold text-sm text-foreground/90">{s.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[11px] text-muted-foreground font-mono">{s.sku}</p>
                                {s.consecutive_confirmation_count > 0 && s.consecutive_confirmation_count < 2 && (
                                    <span className="text-[9px] bg-warning/20 text-warning dark:text-warning px-1.5 rounded font-bold uppercase tracking-widest">
                                        Stabilizing ({s.consecutive_confirmation_count}/2)
                                    </span>
                                )}
                              </div>
                            </td>
                            
                            <td className="px-3 py-4">
                               <MiniProgressBar value={s.velocity_score} max={1.0} label="Spd" colorClass="bg-primary" />
                            </td>
                            <td className="px-3 py-4">
                               <MiniProgressBar value={s.overstock_ratio} max={10.0} label="Lv" colorClass="bg-warning" />
                            </td>
                            
                            <td className="px-3 py-4">
                                <p className="text-sm font-bold text-foreground">{formatCurrency(totalCap)}</p>
                                <p className="text-[10px] font-medium text-success mt-0.5">Proj. Rec: {formatCurrency(recoveryVal)}</p>
                            </td>
                            
                            <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                                <div className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md border", typeColor[s.recommended_action] || "text-success bg-success/10 border-success/20")}>
                                    <Icon size={12} strokeWidth={2.5}/>
                                    {typeLabel[s.recommended_action] || "Monitor"}
                                </div>
                            </td>
                          </motion.tr>

                          {isExpanded && (
                              <motion.tr key={`${s.product_id}-detail`}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="bg-muted/20 border-b border-border/40">
                                <td colSpan="8" className="px-6 py-5">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-background rounded-xl p-5 border border-border shadow-sm">
                                    
                                    {/* Deterministic Explanation */}
                                    <div className="space-y-3">
                                      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        <AlertTriangle size={13} className="text-primary" /> Classification Factors
                                      </h4>
                                      <div className="text-sm text-foreground space-y-2 p-3 bg-muted/30 rounded-lg font-medium text-[13px]">
                                         <p className="flex items-center gap-2">
                                            <span className="text-primary shrink-0">■</span>
                                            Days Since Last Sale: <span className="font-bold">{s.days_since_last_sale}</span>
                                            {s.days_since_last_sale > 90 && <span className="text-destructive text-[10px] bg-destructive/10 px-1 rounded ml-2">High Penalty</span>}
                                         </p>
                                         <p className="flex items-center gap-2">
                                            <span className="text-primary shrink-0">■</span>
                                            Overstock Ratio: <span className="font-bold">{(s.overstock_ratio ?? 0).toFixed(1)}x</span>
                                            {(s.overstock_ratio ?? 0) > 3 && <span className="text-warning text-[10px] bg-warning/10 px-1 rounded ml-2">Elevated</span>}
                                         </p>
                                         <p className="flex items-center gap-2">
                                            <span className="text-primary shrink-0">■</span>
                                            Velocity Deficit: <span className="font-bold">{(1.0 - (s.velocity_score ?? 0)).toFixed(2)}</span>
                                         </p>
                                         <p className="flex items-center gap-2">
                                            <span className="text-primary shrink-0">■</span>
                                            Demand Volatility (CV): <span className="font-bold">{(s.cv ?? 0).toFixed(2)}</span>
                                            {(s.cv ?? 0) > 1.5 ? <span className="text-success text-[10px] bg-success/10 px-1 rounded ml-2">Score Damped 20%</span> : <span className="text-muted-foreground text-[10px] bg-muted px-1 rounded ml-2">Stable</span>}
                                         </p>
                                         <div className="pt-2 mt-2 border-t border-border/50 flex items-center gap-2 justify-between">
                                            <span>Margin Target Status:</span>
                                            <span className="font-bold">{(100 * ((s.unit_price - cost) / (s.unit_price||1))).toFixed(0)}% Margin</span>
                                         </div>
                                      </div>
                                    </div>
                                    
                                    {/* Recommended Action Reasoning */}
                                    <div className="space-y-3">
                                      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        <ArrowRight size={13} className="text-primary" /> Strategic Action Context
                                      </h4>
                                      <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg space-y-3">
                                          <div className="flex items-center gap-2 text-primary dark:text-primary font-bold mb-1">
                                            <Icon size={14}/> {outcome.label}
                                          </div>
                                          <p className="text-sm text-foreground/80 leading-relaxed font-medium">
                                            {outcome.proceed}
                                          </p>
                                          
                                          {s.classification === "DEAD" && (
                                            <div className="bg-destructive/10 text-destructive dark:text-destructive p-2 text-xs rounded font-semibold mt-2">
                                                Warning: Capital trap risk is critical due to severity score {(s.severity_score ?? 0).toFixed(2)} &gt; 2.0. Immediate liquidation recommended.
                                            </div>
                                          )}
                                          {s.classification === "SLOW_MOVING" && s.recommended_action === "BUNDLE" && (
                                            <div className="bg-success/10 text-success dark:text-success p-2 text-xs rounded font-semibold mt-2">
                                                High margin logic detected. Preserving profitability via bundle creation instead of raw discounting.
                                            </div>
                                          )}
                                      </div>
                                    </div>

                                  </div>
                                </td>
                              </motion.tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {displayed.length === 0 && (
                      <tr><td colSpan="8" className="py-24 text-center">
                        <div>
                          <Info size={36} className="mx-auto text-muted-foreground/30 mb-4" />
                          <p className="text-base font-semibold text-foreground">No risks found for criteria</p>
                          <p className="text-sm text-muted-foreground/70 mt-1">Try adjusting your filters or search terms.</p>
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-5 pb-5 mt-2">
                  <PaginationControls currentPage={page} totalPages={totalPages} onPageChange={handlePageChange} />
                </div>
              )}
            </>
          )}
      </div>

    </div>
  );
}
