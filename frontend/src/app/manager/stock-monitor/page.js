"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, Package, TrendingDown, Activity as LoadingIcon, ChevronLeft, ChevronRight, Search, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

// Reusable Pagination UI Component
function PaginationControls({ currentPage, totalItems, pageSize, onPageChange }) {
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
        className="p-1 rounded-md text-muted-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors"
      >
        <ChevronLeft size={18} />
      </button>

      {start > 1 && (
        <>
          <button onClick={() => onPageChange(1)} className="w-8 h-8 flex items-center justify-center text-sm rounded-md text-muted-foreground hover:bg-muted/50 transition-colors">1</button>
          {start > 2 && <span className="text-muted-foreground/50 text-sm px-1">...</span>}
        </>
      )}

      {pages.map(p => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={cn(
            "w-8 h-8 flex items-center justify-center text-sm rounded-md transition-colors",
            p === currentPage ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          {p}
        </button>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-muted-foreground/50 text-sm px-1">...</span>}
          <button onClick={() => onPageChange(totalPages)} className="w-8 h-8 flex items-center justify-center text-sm rounded-md text-muted-foreground hover:bg-muted/50 transition-colors">{totalPages}</button>
        </>
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-1 rounded-md text-muted-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

const typeStyles = {
  low: "bg-destructive/10 text-destructive",
  slow: "bg-primary/10 text-primary",
  dormant: "bg-orange-500/10 text-orange-600",
  dead: "bg-foreground/10 text-foreground",
  expiring: "bg-warning/10 text-warning",
};

const rowHighlight = {
  low: "border-l-2 border-l-destructive",
  slow: "border-l-2 border-l-primary",
  dormant: "border-l-2 border-l-orange-500",
  dead: "border-l-2 border-l-foreground/30",
  expiring: "border-l-2 border-l-warning",
};

export default function StockMonitor() {
  const [loading, setLoading] = useState(true);
  const [stockData, setStockData] = useState([]);
  const [summaryData, setSummaryData] = useState([]);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredStockData = useMemo(() => {
    return stockData.filter(item => {
      const matchesType = activeFilter === "all" || item.type === activeFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch = item.product.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [stockData, activeFilter, searchQuery]);

  // Reset page when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [activeFilter, searchQuery]);

  useEffect(() => {
    fetch("http://localhost:8000/analytics/health-report")
      .then(r => r.json())
      .then(data => {
        const low = (data.low_stock_items || []).map(i => ({
          type: "low", product: i.product_name, sku: i.sku, shelf: i.shelf_code,
          current: i.current_qty, min: i.min_qty,
          risk: i.details?.potential_loss || 0, days: null
        }));
        const slow = data.slow_moving_items.map(i => ({
          type: "slow", product: i.product_name, sku: i.sku, shelf: i.shelf_code,
          current: i.current_qty, min: i.min_qty,
          risk: i.details?.potential_loss || 0, days: null,
          velocity: i.details?.velocity_score ?? null,
          overstock: i.details?.overstock_ratio ?? null,
          action: i.details?.recommended_action ?? null,
        }));
        const dormant = (data.dormant_items || []).map(i => ({
          type: "dormant", product: i.product_name, sku: i.sku, shelf: i.shelf_code,
          current: i.current_qty, min: i.min_qty,
          risk: i.details?.potential_loss || 0, days: i.details?.days_without_sale || null,
          velocity: i.details?.velocity_score ?? null,
          overstock: i.details?.overstock_ratio ?? null,
          action: i.details?.recommended_action ?? null,
        }));
        const dead = data.dead_stock_items.map(i => ({
          type: "dead", product: i.product_name, sku: i.sku, shelf: i.shelf_code,
          current: i.current_qty, min: i.min_qty,
          risk: i.details?.potential_loss || 0, days: i.details?.days_without_sale,
          velocity: i.details?.velocity_score ?? null,
          overstock: i.details?.overstock_ratio ?? null,
          action: i.details?.recommended_action ?? null,
        }));
        const expiring = data.expiry_risk_items.map(i => ({
          type: "expiring", product: i.product_name, sku: i.sku, shelf: i.shelf_code,
          current: i.current_qty, min: i.min_qty,
          risk: i.details?.potential_loss || 0, days: i.details?.days_to_expiry
        }));

        // Deduplicate by (product, type): merge quantities, risk, and shelves
        const dedup = (items) => {
          const map = new Map();
          for (const item of items) {
            const key = `${item.product}::${item.type}`;
            if (map.has(key)) {
              const existing = map.get(key);
              existing.current += item.current;
              existing.risk += item.risk;
              // Collect all shelf codes in a Set
              if (item.shelf) existing._shelves.add(item.shelf);
              // Keep the worst-case days
              if (item.days !== null) {
                existing.days = existing.days !== null ? Math.min(existing.days, item.days) : item.days;
              }
            } else {
              const shelves = new Set();
              if (item.shelf) shelves.add(item.shelf);
              map.set(key, { ...item, _shelves: shelves });
            }
          }
          // Format shelf display and risk string
          return [...map.values()].map(i => {
            const uniqueShelves = [...i._shelves];
            let shelfDisplay;
            if (uniqueShelves.length <= 2) {
              shelfDisplay = uniqueShelves.join(", ");
            } else {
              shelfDisplay = `${uniqueShelves[0]}, ${uniqueShelves[1]} +${uniqueShelves.length - 2} more`;
            }
            const { _shelves, ...rest } = i;
            return { ...rest, shelf: shelfDisplay, risk: `$${i.risk.toLocaleString()}` };
          });
        };

        const allItems = [...low, ...expiring, ...dead, ...dormant, ...slow];
        setStockData(dedup(allItems));
        setSummaryData([
          { label: "Low Stock", count: data.low_stock_count || 0, icon: AlertTriangle, color: "text-destructive bg-destructive/10" },
          { label: "Slow Moving", count: data.slow_moving_count, icon: TrendingDown, color: "text-primary bg-primary/10" },
          { label: "Dormant", count: data.dormant_count || 0, icon: Package, color: "text-orange-600 bg-orange-500/10" },
          { label: "Dead Stock", count: data.dead_stock_count, icon: Package, color: "text-foreground bg-foreground/10" },
          { label: "Expiring", count: data.expiry_risk_count || 0, icon: Clock, color: "text-amber-500 bg-amber-500/10" },
        ]);
        setLoading(false);
      })
      .catch(e => {
        console.error("Failed to load stock data", e);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingIcon className="animate-pulse text-primary h-12 w-12" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stock Monitor</h1>
        <p className="text-sm text-muted-foreground mt-1">Track alerts for low, slow, expiring, and dead stock items.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {summaryData.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass-card rounded-xl p-5 flex items-center gap-4"
          >
            <div className={cn("p-3 rounded-xl", s.color)}>
              <s.icon size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filter and Table */}
      <div className="glass-card rounded-xl p-5 overflow-x-auto space-y-4">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-lg font-semibold whitespace-nowrap">Stock Alerts</h2>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <select 
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">All Alerts</option>
              <option value="low">Low Stock</option>
              <option value="slow">Slow Moving</option>
              <option value="dormant">Dormant</option>
              <option value="dead">Dead Stock</option>
              <option value="expiring">Expiring</option>
            </select>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="pb-3 font-medium">Alert</th>
              <th className="pb-3 font-medium">Product</th>
              <th className="pb-3 font-medium">SKU</th>
              <th className="pb-3 font-medium">Shelf</th>
              <th className="pb-3 font-medium">Current / Min</th>
              <th className="pb-3 font-medium">Capital at Risk</th>
              <th className="pb-3 font-medium">Velocity</th>
              <th className="pb-3 font-medium">Action</th>
              <th className="pb-3 font-medium">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {filteredStockData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((item, i) => (
              <tr key={i} className={cn("border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors", rowHighlight[item.type])}>
                <td className="py-3">
                  <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full", typeStyles[item.type])}>
                    {item.type === "low" ? "🔴 Low" : item.type === "slow" ? "🐢 Slow" : item.type === "dormant" ? "💤 Dormant" : item.type === "dead" ? "⚫ Dead" : "🟡 Expiry"}
                  </span>
                </td>
                <td className="py-3 font-medium">{item.product}</td>
                <td className="py-3 font-mono text-xs text-muted-foreground">{item.sku}</td>
                <td className="py-3">{item.shelf}</td>
                <td className="py-3">
                  <span className={cn(item.current < item.min ? "text-destructive font-semibold" : "")}>
                    {item.current}
                  </span>
                  <span className="text-muted-foreground"> / {item.min}</span>
                </td>
                <td className="py-3 font-semibold text-destructive">{item.risk}</td>
                <td className="py-3">
                  {item.velocity !== null && item.velocity !== undefined ? (
                    <div className="flex items-center gap-1.5">
                      <Zap size={12} className={item.velocity > 0.5 ? "text-green-500" : item.velocity > 0.2 ? "text-yellow-500" : "text-red-400"} />
                      <span className="font-mono text-xs">{Number(item.velocity).toFixed(2)}</span>
                      {item.overstock !== null && item.overstock !== undefined && (
                        <span className="text-[10px] text-muted-foreground ml-1">OS: {Number(item.overstock).toFixed(1)}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-3">
                  {item.action && item.action !== "NONE" ? (
                    <span className={cn(
                      "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full",
                      item.action === "DISPOSAL" ? "bg-destructive/10 text-destructive" :
                      item.action === "BUNDLE" ? "bg-violet-500/10 text-violet-600" :
                      item.action === "HEAVY_DISCOUNT" ? "bg-orange-500/10 text-orange-600" :
                      item.action === "DISCOUNT" ? "bg-emerald-500/10 text-emerald-600" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {item.action.replace('_', ' ')}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-3 text-muted-foreground">
                  {item.days !== null ? (
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {item.days}d
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredStockData.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No alerts found for this filter.
          </div>
        )}
        <PaginationControls 
          currentPage={page} 
          totalItems={filteredStockData.length} 
          pageSize={PAGE_SIZE} 
          onPageChange={setPage} 
        />
      </div>
    </div>
  );
}
