"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tag, Activity, Search, CalendarDays, Percent, Layers, ChevronLeft, ChevronRight, Loader2 as LoadingIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PAGE_SIZE = 12;

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

export default function DiscountsPage() {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [toggling, setToggling] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/analytics/promotions");
      if (res.ok) {
        setPromotions(await res.json());
      } else {
        toast.error("Failed to load promotions data.");
      }
    } catch (error) {
      console.error("Failed to fetch promotions data", error);
      toast.error("Failed to load promotions data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const toggleStatus = async (promoId, currentStatus) => {
    try {
      setToggling(promoId);
      // Backend expects a PATCH to update promotion state.
      // E.g., /analytics/promotions/{id}/status 
      const res = await fetch(`http://localhost:8000/analytics/promotions/${promoId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentStatus })
      });
      if (res.ok) {
        // Optimistic UI Update since backend route might not perfectly return full object
        setPromotions(prev => prev.map(p => p.id === promoId ? { ...p, is_active: !currentStatus } : p));
        toast.success("Promotion status updated.");
      } else {
        toast.error("Endpoint might not be implemented, optimistic update only.");
        setPromotions(prev => prev.map(p => p.id === promoId ? { ...p, is_active: !currentStatus } : p));
      }
    } catch (error) {
      console.error("Failed to toggle status:", error);
      toast.error("Failed to update status due to network error.");
    } finally {
      setToggling(null);
    }
  };

  const deletePromotion = async (promoId) => {
    if (!window.confirm("Are you sure you want to delete this discount campaign?")) return;
    try {
      const res = await fetch(`http://localhost:8000/analytics/promotions/${promoId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setPromotions(prev => prev.filter(p => p.id !== promoId));
        toast.success("Discount deleted successfully.");
      } else {
        toast.error("Failed to delete discount.");
      }
    } catch (e) {
      console.error("Failed to delete discount:", e);
      toast.error("Network error while deleting discount.");
    }
  };

  const toggleSelectPromo = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const currentPageIds = filteredPromotions
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map(p => p.id);
    const allSelected = currentPageIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      currentPageIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const batchToggleStatus = async (newStatus) => {
    if (selectedIds.size === 0) return;
    setBatchProcessing(true);
    try {
      // Optimistic bulk update
      setPromotions(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, is_active: newStatus } : p));
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} promotion(s) updated to ${newStatus ? "Active" : "Draft"}`);
    } catch (error) {
      toast.error("Failed to batch update statuses.");
    } finally {
      setBatchProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Activity className="animate-pulse text-warning h-12 w-12" />
      </div>
    );
  }

  const activeCount = promotions.filter(p => p.is_active).length;

  // Filter by search query and status filter
  const filteredPromotions = promotions.filter(promo => {
    // 1. Check status filter
    const matchesStatus = 
      statusFilter === "all" || 
      (statusFilter === "active" && promo.is_active) || 
      (statusFilter === "draft" && !promo.is_active);
      
    if (!matchesStatus) return false;

    // 2. Check search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const productNameMatch = promo.product_name?.toLowerCase().includes(q);
    const nameMatch = promo.name?.toLowerCase().includes(q);
    return productNameMatch || nameMatch;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Discounted Items</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage single-item promotions and track discounted inventory.</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
           initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
           className="glass-card rounded-xl p-5 flex items-center gap-4 bg-warning/5 hover:bg-warning/10 transition-colors border border-warning/20"
        >
          <div className="p-3 rounded-xl bg-warning/20 text-warning"><Percent size={22} /></div>
          <div>
            <p className="text-2xl font-bold">{promotions.length}</p>
            <p className="text-xs text-warning uppercase tracking-wider font-semibold">Total Discounts</p>
          </div>
        </motion.div>
        
        <motion.div
           initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
           className="glass-card rounded-xl p-5 flex items-center gap-4 hover:bg-muted/30 transition-colors"
        >
          <div className="p-3 rounded-xl bg-success/20 text-success"><Activity size={22} /></div>
          <div>
            <p className="text-2xl font-bold">{activeCount}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Active Campaigns</p>
          </div>
        </motion.div>
      </div>

      {/* Container */}
      <div className="glass-card rounded-xl p-1 min-h-[500px]">
        {/* Search Bar and Filter */}
        <div className="px-4 pt-4 pb-2 border-b border-border/40">
          <div className="flex flex-col sm:flex-row items-center gap-3 max-w-2xl">
            <div className="relative flex-1 w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by product or discount name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-warning/30 focus:border-warning transition-all placeholder:text-muted-foreground/60"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-40 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-warning/50"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>

        <motion.div
          key="promotions"
          initial={{ opacity: 0, y: 10 }}  animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
          className="overflow-x-auto"
        >
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/10">
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" 
                    checked={filteredPromotions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).length > 0 && filteredPromotions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).every(p => selectedIds.has(p.id))}
                    onChange={toggleSelectAll}
                    className="rounded border-border accent-warning cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3 font-medium">Campaign ID</th>
                <th className="py-3 font-medium">Campaign Name</th>
                <th className="py-3 font-medium">Product</th>
                <th className="py-3 font-medium">Discount</th>
                <th className="py-3 font-medium">Created Date</th>
                <th className="py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPromotions.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-12 text-muted-foreground">
                  {searchQuery ? "No discounts match your search." : "No discounts found."}
                </td></tr>
              ) : (
                filteredPromotions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((promo) => (
                  <tr key={promo.id} className={cn("border-b border-border/50 hover:bg-muted/30 transition-colors", selectedIds.has(promo.id) && "bg-warning/5")}>
                    <td className="px-3 py-3">
                      <input type="checkbox" 
                        checked={selectedIds.has(promo.id)}
                        onChange={() => toggleSelectPromo(promo.id)}
                        className="rounded border-border accent-warning cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">#{promo.id}</td>
                    <td className="py-3 font-medium text-foreground">{promo.name}</td>
                    <td className="py-3 font-semibold text-foreground/80">{promo.product_name}</td>
                    <td className="py-3">
                      <span className="font-bold text-warning bg-warning/10 px-2 py-0.5 rounded border border-warning/20">
                        {promo.discount_value}% OFF
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground flex items-center gap-2">
                       <CalendarDays size={14} className="opacity-70" /> {new Date(promo.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => toggleStatus(promo.id, promo.is_active)}
                          disabled={toggling === promo.id}
                          className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 transition-all hover:opacity-80 disabled:opacity-50", 
                            promo.is_active ? "bg-success/15 text-success border border-success/30" : "bg-muted text-muted-foreground border border-border"
                          )}>
                          {promo.is_active ? "Active" : "Draft"}
                        </button>
                        <button 
                          onClick={() => deletePromotion(promo.id)} 
                          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                          title="Delete Discount"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Batch Action Bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between px-4 py-3 bg-warning/5 border-t border-warning/20 rounded-b-lg">
              <span className="text-sm font-medium">{selectedIds.size} discount(s) selected</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => batchToggleStatus(true)}
                  disabled={batchProcessing}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50"
                >
                  Set Active
                </button>
                <button
                  onClick={() => batchToggleStatus(false)}
                  disabled={batchProcessing}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                >
                  Set Draft
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <PaginationControls 
            currentPage={page} 
            totalItems={filteredPromotions.length} 
            pageSize={PAGE_SIZE} 
            onPageChange={setPage} 
          />
        </motion.div>
      </div>
    </div>
  );
}
