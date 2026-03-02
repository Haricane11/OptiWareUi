"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw, CheckCircle2, AlertTriangle, TrendingUp,
  ShoppingCart, Activity, Zap, History, Calendar, Filter, ChevronLeft, ChevronRight, Search
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const urgencyStyles = {
  critical: { label: "Critical", style: "bg-destructive/10 text-destructive" },
  moderate: { label: "Moderate", style: "bg-warning/10 text-warning" },
  low: { label: "Low", style: "bg-success/10 text-success" },
};

const statusBadge = {
  DRAFT: "bg-muted text-muted-foreground",
  ORDERED: "bg-primary/10 text-primary",
  PARTIALLY_RECEIVED: "bg-warning/10 text-warning",
  FULLY_RECEIVED: "bg-success/10 text-success",
  CLOSED: "bg-foreground/10 text-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
};

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

export default function ReorderDecisions() {
  const [suggestions, setSuggestions] = useState([]);
  const [totalSuggestions, setTotalSuggestions] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState({});
  const [processingId, setProcessingId] = useState(null);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("suggestions");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // Date filter state
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Search state
  const [suggestionsSearch, setSuggestionsSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");

  const fetchSuggestions = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const offset = (page - 1) * PAGE_SIZE;
      let url = `http://localhost:8000/reorder/suggestions?limit=${PAGE_SIZE}&offset=${offset}`;
      if (urgencyFilter) url += `&urgency=${urgencyFilter}`;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        setTotalSuggestions(data.total || 0);
      }
    } catch (error) {
      toast.error("Failed to load reorder suggestions");
    } finally {
      setLoading(false);
    }
  }, [urgencyFilter]);

  const fetchHistory = useCallback(async () => {
    try {
      let url = "http://localhost:8000/reorder/history";
      const params = new URLSearchParams();
      if (fromDate) params.append("from_date", fromDate);
      if (toDate) params.append("to_date", toDate);
      if (params.toString()) url += `?${params.toString()}`;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
        setHistoryPage(1); // Reset page on new fetch
      }
    } catch (error) {
      toast.error("Failed to load reorder history");
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchSuggestions(currentPage);
  }, [currentPage, fetchSuggestions]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reset page when urgency filter changes
  useEffect(() => { 
    if (currentPage !== 1) setCurrentPage(1);
    else fetchSuggestions(1);
  }, [urgencyFilter]);

  // Refresh history when dates change
  useEffect(() => {
    if (activeTab === "history") fetchHistory();
  }, [fromDate, toDate, activeTab, fetchHistory]);


  const handleAccept = async (productId) => {
    setProcessingId(productId);
    try {
      const res = await fetch(`http://localhost:8000/reorder/check/${productId}`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        toast[result.po_created ? "success" : "info"](result.detail);
        setAccepted(prev => ({ ...prev, [productId]: result.detail }));
        fetchHistory();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to create PO");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleAutoReorder = async () => {
    setIsAutoRunning(true);
    toast.info("Running automatic reorder check...");
    try {
      const res = await fetch("http://localhost:8000/reorder/check-all", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        const created = results.filter(r => r.po_created).length;
        const skipped = results.filter(r => !r.po_created && r.needs_reorder).length;
        toast.success(`Done: ${created} POs created, ${skipped} skipped`);
        fetchSuggestions(currentPage);
        fetchHistory();
      } else {
        toast.error("Auto-reorder failed");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setIsAutoRunning(false);
    }
  };

  // Filter suggestions by search
  const filteredSuggestions = suggestions.filter(item => {
    if (!suggestionsSearch.trim()) return true;
    const q = suggestionsSearch.toLowerCase();
    return (
      item.product_name?.toLowerCase().includes(q) ||
      item.sku?.toLowerCase().includes(q) ||
      item.supplier_name?.toLowerCase().includes(q)
    );
  });

  // Filter history by search
  const filteredHistory = history.filter(h => {
    if (!historySearch.trim()) return true;
    const q = historySearch.toLowerCase();
    return (
      h.product_name?.toLowerCase().includes(q) ||
      h.product_sku?.toLowerCase().includes(q) ||
      h.po_number?.toLowerCase().includes(q) ||
      h.supplier_name?.toLowerCase().includes(q)
    );
  });

  const paginatedHistory = filteredHistory.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reordering</h1>
          <p className="text-sm text-muted-foreground mt-1">System-generated suggestions based on ROP & EOQ calculations.</p>
        </div>
        <button
          onClick={handleAutoReorder}
          disabled={isAutoRunning}
          className="flex items-center gap-2 gradient-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Zap size={16} className={isAutoRunning ? "animate-pulse" : ""} />
          {isAutoRunning ? "Running..." : "Auto-Reorder All"}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Needing Reorder", count: totalSuggestions, icon: AlertTriangle, color: "text-destructive bg-destructive/10" },
          { label: "Page Items", count: suggestions.length, icon: TrendingUp, color: "text-warning bg-warning/10" },
          { label: "Accepted", count: Object.keys(accepted).length, icon: CheckCircle2, color: "text-success bg-success/10" },
          { label: "POs Created", count: history.length, icon: History, color: "text-primary bg-primary/10" },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", s.color)}><s.icon size={18} /></div>
            <div>
              <p className="text-xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
          <button onClick={() => setActiveTab("suggestions")}
            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === "suggestions" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}>
            <ShoppingCart size={14} className="inline mr-1.5 -mt-0.5" />
            Suggestions
          </button>
          <button onClick={() => setActiveTab("history")}
            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === "history" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}>
            <History size={14} className="inline mr-1.5 -mt-0.5" />
            History ({history.length})
          </button>
        </div>

        {/* Urgency Filter */}
        {activeTab === "suggestions" && (
          <div className="flex gap-1.5">
            {["", "critical", "moderate"].map(f => (
              <button key={f} onClick={() => setUrgencyFilter(f)}
                className={cn("text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
                  urgencyFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                )}>
                {f === "" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions Tab */}
      {activeTab === "suggestions" && (
        <div className={cn("space-y-3", loading && "opacity-50 pointer-events-none")}>
          {/* Search Bar */}
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by product, SKU, or supplier..."
              value={suggestionsSearch}
              onChange={(e) => setSuggestionsSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-muted-foreground/60"
            />
          </div>

          {filteredSuggestions.map((item) => {
            const isAccepted = accepted[item.product_id];
            const urg = urgencyStyles[item.urgency] || urgencyStyles.low;
            return (
              <div key={item.product_id}
                className={cn("glass-card rounded-xl p-5 transition-all", isAccepted && "opacity-60 border-success/30")}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full", urg.style)}>{urg.label}</span>
                      <h3 className="font-semibold text-sm">{item.product_name}</h3>
                      <span className="text-xs font-mono text-muted-foreground">{item.sku}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Current Stock</span>
                        <span className={cn("font-bold", item.current_stock < item.reorder_point ? "text-destructive" : "")}>{item.current_stock}</span>
                        <span className="text-muted-foreground"> / {item.reorder_point} ROP</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Suggested Qty (EOQ)</span>
                        <span className="font-bold">{item.eoq} units</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Est. Cost</span>
                        <span className="font-bold">${item.estimated_cost.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Lead Time</span>
                        <span>{item.lead_time_days} days</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Supplier: <span className="text-foreground">{item.supplier_name}</span></p>
                  </div>
                  <div className="flex gap-2 sm:flex-col">
                    {isAccepted ? (
                      <div className="space-y-1 text-right">
                        <div className="flex items-center gap-1.5 text-sm text-success font-medium">
                          <CheckCircle2 size={16} /> PO Created
                        </div>
                        <p className="text-[10px] text-muted-foreground max-w-[180px]">{isAccepted}</p>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => handleAccept(item.product_id)}
                          disabled={processingId === item.product_id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                          <ShoppingCart size={14} className={processingId === item.product_id ? "animate-pulse" : ""} />
                          {processingId === item.product_id ? "Creating..." : "Accept & Order"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredSuggestions.length === 0 && !loading && (
            <div className="glass-card rounded-xl p-12 text-center text-muted-foreground">
              <CheckCircle2 size={40} className="mx-auto mb-3 text-primary/40" />
              <p>{suggestionsSearch ? "No suggestions match your search." : `No products need reordering${urgencyFilter ? ` at ${urgencyFilter} level` : ""}.`}</p>
            </div>
          )}

          <Pagination 
            currentPage={currentPage} 
            totalItems={totalSuggestions} 
            pageSize={PAGE_SIZE} 
            onPageChange={setCurrentPage} 
          />
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="glass-card rounded-xl p-4 flex flex-wrap items-end gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search PO, product, or supplier..."
                value={historySearch}
                onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium">Filter by Date</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">From</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-lg border border-border bg-background text-foreground" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">To</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-lg border border-border bg-background text-foreground" />
            </div>
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(""); setToDate(""); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <Filter size={12} /> Clear
              </button>
            )}
          </div>

          <div className="glass-card rounded-xl p-1 overflow-x-auto min-h-[400px] flex flex-col justify-between">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-4 py-3 font-medium">PO Number</th>
                  <th className="py-3 font-medium">Product</th>
                  <th className="py-3 font-medium">Qty</th>
                  <th className="py-3 font-medium">Supplier</th>
                  <th className="py-3 font-medium">Status</th>
                  <th className="py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map((h) => (
                  <tr key={h.po_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-primary">{h.po_number}</td>
                    <td className="py-3 font-medium">{h.product_name}</td>
                    <td className="py-3 font-bold">{h.ordered_qty}</td>
                    <td className="py-3 text-muted-foreground">{h.supplier_name}</td>
                    <td className="py-3">
                      <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded", statusBadge[h.status] || "bg-muted text-muted-foreground")}>
                        {h.status}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">{h.created_at ? new Date(h.created_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
                {paginatedHistory.length === 0 && (
                  <tr><td colSpan="6" className="py-8 text-center text-muted-foreground">
                    <History size={32} className="mx-auto mb-2 text-primary/30" />
                    No POs found{(fromDate || toDate) ? " for this date range" : ""}.
                  </td></tr>
                )}
              </tbody>
            </table>
            
            <div className="p-4 border-t border-border mt-auto">
              <Pagination 
                currentPage={historyPage} 
                totalItems={filteredHistory.length} 
                pageSize={PAGE_SIZE} 
                onPageChange={setHistoryPage} 
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
