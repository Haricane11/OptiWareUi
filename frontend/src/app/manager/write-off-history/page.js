"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2, Loader2, ChevronLeft, ChevronRight, Search,
  Clock, Package, DollarSign, FileText, ArrowDownRight,
  Info, Calendar, Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ─── Helpers ─────────────────────────────────────────────────────────
const formatCurrency = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ─── Pagination ──────────────────────────────────────────────────────
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
            p === currentPage ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted/50")}>{p}</button>
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

// ─── Main Page ───────────────────────────────────────────────────────
export default function WriteOffHistoryPage() {
  const [history, setHistory] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const PAGE_SIZE = 25;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const res = await fetch(`${API}/analytics/write-off-history?limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await res.json();
      setHistory(data.history || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch write-off history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [page]);

  // Client-side search filter
  const filtered = searchTerm
    ? history.filter(h =>
        h.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.product_sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.warehouse_name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : history;

  // Summary stats
  const totalLossValue = filtered.reduce((sum, h) => sum + (h.loss_value || 0), 0);
  const totalQtyWrittenOff = filtered.reduce((sum, h) => sum + (h.quantity || 0), 0);
  const uniqueProducts = new Set(filtered.map(h => h.product_sku)).size;

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trash2 className="text-destructive" size={28} />
            Write-Off History
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Immutable audit ledger of all inventory disposal actions executed by management.
          </p>
        </div>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
          className="bg-card border border-border rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-1">
            <FileText size={16} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Write-Offs</span>
          </div>
          <p className="text-2xl font-bold">{total}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-card border border-border rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={16} className="text-destructive" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Loss Value</span>
          </div>
          <p className="text-2xl font-bold text-destructive">{formatCurrency(totalLossValue)}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-1">
            <Package size={16} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Qty Written Off</span>
          </div>
          <p className="text-2xl font-bold">{totalQtyWrittenOff.toLocaleString()}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card border border-border rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-1">
            <Warehouse size={16} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Products Affected</span>
          </div>
          <p className="text-2xl font-bold">{uniqueProducts}</p>
        </motion.div>
      </div>

      {/* ── Table Section ────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
          <h2 className="text-sm font-semibold text-foreground/80">Transaction Ledger</h2>
          <div className="relative w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by product, SKU, or warehouse..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <Info size={36} className="mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-base font-semibold text-foreground">No write-off records found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {total === 0
                ? "Execute a disposal action from the Financial Loss page to create write-off records."
                : "Try adjusting your search terms."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Warehouse</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qty</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit Price</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Loss Value</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reason</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ref ID</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filtered.map((h, i) => (
                      <motion.tr
                        key={h.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="border-b border-border/30 hover:bg-muted/20 transition-colors group"
                      >
                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar size={13} className="text-muted-foreground/50" />
                            <span className="text-xs text-foreground/80">{formatDate(h.created_at)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div>
                            <p className="font-medium text-foreground text-sm truncate max-w-[200px]" title={h.product_name}>{h.product_name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{h.product_sku}</p>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <Warehouse size={12} className="text-muted-foreground/50" />
                            <span className="text-xs text-foreground/70">{h.warehouse_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-destructive">
                            <ArrowDownRight size={12} />
                            {h.quantity}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                          {formatCurrency(h.unit_price)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={cn(
                            "text-sm font-bold",
                            h.loss_value > 0 ? "text-destructive" : "text-muted-foreground"
                          )}>
                            {formatCurrency(h.loss_value)}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                            <Trash2 size={10} />
                            {h.reason || "Dead Stock Disposal"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground font-mono">
                          #{h.reference_action_id || "—"}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 pb-5 mt-2">
                <PaginationControls currentPage={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
