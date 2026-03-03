"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Activity, Search, CalendarDays, DollarSign, Tag, TrendingUp, Layers, ChevronLeft, ChevronRight, Loader2 as LoadingIcon, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProducts } from "@/lib/api/products";

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

export default function BundlesPage() {
  const [activeTab, setActiveTab] = useState("bundles");
  const [bundles, setBundles] = useState([]);
  const [bundleSales, setBundleSales] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newBundleParams, setNewBundleParams] = useState({ bundle_name: "", bundle_price: "", item1_id: "", item1_qty: 1, item2_id: "", item2_qty: 1 });
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bundlesPage, setBundlesPage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [salesSearchQuery, setSalesSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [toggling, setToggling] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bundlesRes, salesRes, productsData] = await Promise.all([
        fetch("http://localhost:8000/analytics/bundles"),
        fetch("http://localhost:8000/analytics/bundles/sales"),
        getProducts()
      ]);
      
      if (bundlesRes.ok) setBundles(await bundlesRes.json());
      if (salesRes.ok) setBundleSales(await salesRes.json());
      setAllProducts(productsData || []);
    } catch (error) {
      console.error("Failed to fetch bundle data", error);
      toast.error("Failed to load bundles data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Reset page when filter changes
  useEffect(() => {
    setBundlesPage(1);
  }, [searchQuery, statusFilter]);

  const toggleBundleStatus = async (bundleId, currentStatus) => {
    try {
      setToggling(bundleId);
      const res = await fetch(`http://localhost:8000/analytics/bundles/${bundleId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentStatus })
      });
      if (res.ok) {
        const updatedBundle = await res.json();
        setBundles(prev => prev.map(b => b.id === bundleId ? updatedBundle : b));
      } else {
        toast.error("Failed to update bundle status.");
      }
    } catch (error) {
      console.error("Failed to toggle bundle status:", error);
      toast.error("Failed to update bundle status due to network error.");
    } finally {
      setToggling(null);
    }
  };

  const toggleSelectBundle = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const currentPageIds = filteredBundles
      .slice((bundlesPage - 1) * PAGE_SIZE, bundlesPage * PAGE_SIZE)
      .map(b => b.id);
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
      const promises = [...selectedIds].map(id =>
        fetch(`http://localhost:8000/analytics/bundles/${id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: newStatus })
        }).then(res => res.ok ? res.json() : null)
      );
      const results = await Promise.all(promises);
      const updated = results.filter(Boolean);
      setBundles(prev => {
        const updatedMap = Object.fromEntries(updated.map(b => [b.id, b]));
        return prev.map(b => updatedMap[b.id] || b);
      });
      setSelectedIds(new Set());
      toast.success(`${updated.length} bundle(s) updated to ${newStatus ? "Active" : "Draft"}`);
    } catch (error) {
      toast.error("Failed to batch update statuses.");
    } finally {
      setBatchProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Activity className="animate-pulse text-primary h-12 w-12" />
      </div>
    );
  }

  const activeBundlesCount = bundles.filter(b => b.is_active).length;
  const totalSalesRevenue = bundleSales.reduce((sum, sale) => {
    const parentBundle = bundles.find(b => b.id === sale.bundle_id);
    return sum + (parentBundle ? parentBundle.bundle_price * sale.quantity : 0);
  }, 0);

  // Helper: build display name from bundle items' product names
  const getBundleDisplayName = (bundle) => {
    if (bundle.items && bundle.items.length > 0 && bundle.items[0].product_name) {
      return bundle.items.map(it => it.product_name).join(" + ");
    }
    // Fallback to bundle_name (strip "Bundle: " prefix)
    return bundle.bundle_name.replace(/^Bundle:\s*/i, "");
  };

  // Filter bundles by search query and status filter
  const filteredBundles = bundles.filter(bundle => {
    // 1. Check status filter
    const matchesStatus = 
      statusFilter === "all" || 
      (statusFilter === "active" && bundle.is_active) || 
      (statusFilter === "draft" && !bundle.is_active);
      
    if (!matchesStatus) return false;

    // 2. Check search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesItems = bundle.items?.some(it => 
      it.product_name?.toLowerCase().includes(q)
    );
    const matchesName = bundle.bundle_name.toLowerCase().includes(q);
    return matchesItems || matchesName;
  });

  // Filter bundle sales by search query (matches bundle name or order number)
  const filteredSales = bundleSales.filter(sale => {
    if (!salesSearchQuery.trim()) return true;
    const q = salesSearchQuery.toLowerCase();
    const matchesBundle = sale.bundle_name?.toLowerCase().includes(q);
    const matchesOrder = sale.order_number?.toLowerCase().includes(q);
    return matchesBundle || matchesOrder;
  });

  // dynamic add/remove items handles removed since we enforce exactly 2 items now
  const handleCreateBundle = async () => {
     if (!newBundleParams.bundle_name || !newBundleParams.bundle_price || !newBundleParams.item1_id || !newBundleParams.item2_id) {
        toast.error("Please fill in bundle name, price, and select both items.");
        return;
     }
     
     if (newBundleParams.item1_id === newBundleParams.item2_id) {
        toast.error("Please select two distinct items for the bundle.");
        return;
     }
     
     setIsCreating(true);
     try {
       const payload = {
         bundle_name: newBundleParams.bundle_name,
         bundle_price: parseFloat(newBundleParams.bundle_price),
         items: [
           { product_id: parseInt(newBundleParams.item1_id), quantity: parseInt(newBundleParams.item1_qty) },
           { product_id: parseInt(newBundleParams.item2_id), quantity: parseInt(newBundleParams.item2_qty) }
         ]
       };

       const res = await fetch("http://localhost:8000/analytics/bundles/manual", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(payload)
       });

       if (res.ok) {
         toast.success("Custom bundle created successfully!");
         setNewBundleParams({ bundle_name: "", bundle_price: "", item1_id: "", item1_qty: 1, item2_id: "", item2_qty: 1 });
         setIsCreateModalOpen(false);
         fetchData();
       } else {
         const data = await res.json();
         toast.error(data.detail || "Failed to create bundle");
       }
     } catch (e) {
       toast.error("Network error while creating bundle");
     } finally {
       setIsCreating(false);
     }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Virtual Bundles</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage product bundles and track bundle sales performance.</p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2">
          <Plus size={16} /> Add Custom Bundle
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
           initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
           className="glass-card rounded-xl p-5 flex items-center gap-4 bg-primary/5 hover:bg-primary/10 transition-colors border border-primary/20"
        >
          <div className="p-3 rounded-xl bg-primary/20 text-primary"><Layers size={22} /></div>
          <div>
            <p className="text-2xl font-bold">{bundles.length}</p>
            <p className="text-xs text-primary uppercase tracking-wider font-semibold">Total Bundles</p>
          </div>
        </motion.div>
        
        <motion.div
           initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
           className="glass-card rounded-xl p-5 flex items-center gap-4 hover:bg-muted/30 transition-colors"
        >
          <div className="p-3 rounded-xl bg-success/20 text-success"><Activity size={22} /></div>
          <div>
            <p className="text-2xl font-bold">{activeBundlesCount}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Active Bundles</p>
          </div>
        </motion.div>

        <motion.div
           initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
           className="glass-card rounded-xl p-5 flex items-center gap-4 hover:bg-muted/30 transition-colors"
        >
          <div className="p-3 rounded-xl bg-foreground/10 text-foreground"><TrendingUp size={22} /></div>
          <div>
            <p className="text-2xl font-bold">${totalSalesRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Est. Bundle Revenue</p>
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-px">
        <button
          onClick={() => setActiveTab("bundles")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all relative flex items-center gap-2",
            activeTab === "bundles" ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
          )}
        >
          <Package size={16} /> Created Bundles
          {activeTab === "bundles" && (
            <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("sales")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all relative flex items-center gap-2",
            activeTab === "sales" ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
          )}
        >
          <Tag size={16} /> Bundle Sales
          {activeTab === "sales" && (
            <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="glass-card rounded-b-xl rounded-tr-xl p-1 min-h-[500px]">
        {/* Search Bar and Filter - Bundles */}
        {activeTab === "bundles" && (
          <div className="px-4 pt-4 pb-2">
            <div className="flex flex-col sm:flex-row items-center gap-3 max-w-2xl">
              <div className="relative flex-1 w-full">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by product name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-muted-foreground/60"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-40 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>
        )}
        {/* Search Bar — Sales */}
        {activeTab === "sales" && (
          <div className="px-4 pt-4 pb-2">
            <div className="relative max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by bundle name or order number..."
                value={salesSearchQuery}
                onChange={(e) => { setSalesSearchQuery(e.target.value); setSalesPage(1); }}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-muted-foreground/60"
              />
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          {activeTab === "bundles" ? (
            <motion.div
              key="bundles"
              initial={{ opacity: 0, y: 10 }}  animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
              className="overflow-x-auto"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/20">
                    <th className="px-2 py-3 w-10">
                      <input type="checkbox" 
                        checked={filteredBundles.slice((bundlesPage - 1) * PAGE_SIZE, bundlesPage * PAGE_SIZE).length > 0 && filteredBundles.slice((bundlesPage - 1) * PAGE_SIZE, bundlesPage * PAGE_SIZE).every(b => selectedIds.has(b.id))}
                        onChange={toggleSelectAll}
                        className="rounded border-border accent-primary cursor-pointer"
                      />
                    </th>
                    <th className="px-2 py-3 font-medium">Bundle ID</th>
                    <th className="py-3 font-medium">Name</th>
                    <th className="py-3 font-medium">Price</th>
                    <th className="py-3 font-medium">Created Date</th>
                    <th className="py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBundles.length === 0 ? (
                    <tr><td colSpan="6" className="text-center py-12 text-muted-foreground">
                      {searchQuery ? "No bundles match your search." : "No bundles found."}
                    </td></tr>
                  ) : (
                    filteredBundles.slice((bundlesPage - 1) * PAGE_SIZE, bundlesPage * PAGE_SIZE).map((bundle, i) => (
                      <tr key={bundle.id} className={cn("border-b border-border/50 hover:bg-muted/30 transition-colors", selectedIds.has(bundle.id) && "bg-primary/5")}>
                        <td className="px-2 py-3">
                          <input type="checkbox" 
                            checked={selectedIds.has(bundle.id)}
                            onChange={() => toggleSelectBundle(bundle.id)}
                            className="rounded border-border accent-primary cursor-pointer"
                          />
                        </td>
                        <td className="px-2 py-3 font-mono text-xs text-muted-foreground">#{bundle.id}</td>
                        <td className="py-3 font-medium">{getBundleDisplayName(bundle)}</td>
                        <td className="py-3 font-semibold text-primary">
                          ${bundle.bundle_price.toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </td>
                        <td className="py-3 text-muted-foreground flex items-center gap-2">
                           <CalendarDays size={14} className="opacity-70" /> {new Date(bundle.created_at).toLocaleString()}
                        </td>
                        <td className="py-3">
                          <button 
                            onClick={() => toggleBundleStatus(bundle.id, bundle.is_active)}
                            disabled={toggling === bundle.id}
                            className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 transition-all hover:opacity-80 disabled:opacity-50", 
                              bundle.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                            )}>
                            {toggling === bundle.id ? (
                              <LoadingIcon size={10} className="animate-spin" />
                            ) : bundle.is_active ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            ) : null}
                            {bundle.is_active ? "Active" : "Draft"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Batch Action Bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-t border-primary/20 rounded-b-lg">
                  <span className="text-sm font-medium">{selectedIds.size} bundle(s) selected</span>
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
                currentPage={bundlesPage} 
                totalItems={filteredBundles.length} 
                pageSize={PAGE_SIZE} 
                onPageChange={setBundlesPage} 
              />
            </motion.div>
          ) : (
            <motion.div
              key="sales"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
              className="overflow-x-auto"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/20">
                    <th className="px-4 py-3 font-medium rounded-tl-lg">Order #</th>
                    <th className="py-3 font-medium">Bundle Sold</th>
                    <th className="py-3 font-medium">Price</th>
                    <th className="py-3 font-medium">Quantity</th>
                    <th className="py-3 font-medium">Date Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.length === 0 ? (
                    <tr><td colSpan="5" className="text-center py-12 text-muted-foreground">
                      {salesSearchQuery ? "No sales match your search." : "No bundle sales recorded yet."}
                    </td></tr>
                  ) : (
                    filteredSales.slice((salesPage - 1) * PAGE_SIZE, salesPage * PAGE_SIZE).map((sale, i) => (
                      <tr key={sale.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-foreground">{sale.order_number}</td>
                        <td className="py-3">
                           <div className="font-medium">{sale.bundle_name.replace(/^Bundle:\s*/i, "")}</div>
                           <div className="text-[10px] text-muted-foreground font-mono mt-0.5">ID: #{sale.bundle_id}</div>
                        </td>
                        <td className="py-3 font-semibold text-primary">
                          {(() => {
                            const parentBundle = bundles.find(b => b.id === sale.bundle_id);
                            const unitPrice = parentBundle ? parentBundle.bundle_price : 0;
                            const total = unitPrice * sale.quantity;
                            return (
                              <div>
                                <div>${total.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                {sale.quantity > 1 && <div className="text-[10px] text-muted-foreground font-normal">${unitPrice.toLocaleString(undefined, {minimumFractionDigits: 2})} each</div>}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3">
                          <span className="font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                             {sale.quantity}x
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground flex items-center gap-2">
                          <CalendarDays size={14} className="opacity-70" /> {new Date(sale.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <PaginationControls 
                currentPage={salesPage} 
                totalItems={filteredSales.length} 
                pageSize={PAGE_SIZE} 
                onPageChange={setSalesPage} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Create Custom Bundle Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Custom Bundle</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
               <div>
                 <Label>Bundle Name</Label>
                 <Input 
                   placeholder="e.g. Summer Promo Kit" 
                   value={newBundleParams.bundle_name}
                   onChange={e => setNewBundleParams({...newBundleParams, bundle_name: e.target.value})}
                 />
               </div>
               <div>
                 <Label>Bundle Price ($)</Label>
                 <Input 
                   type="number" step="0.01" min="0" placeholder="0.00"
                   value={newBundleParams.bundle_price}
                   onChange={e => setNewBundleParams({...newBundleParams, bundle_price: e.target.value})}
                 />
               </div>
            </div>
            
            <div className="border border-border/50 p-4 rounded-xl space-y-3 bg-muted/10 mt-2">
               <Label className="font-semibold text-primary">Item 1</Label>
               <div className="flex gap-2 mb-4">
                 <select 
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={newBundleParams.item1_id}
                    onChange={e => setNewBundleParams({...newBundleParams, item1_id: e.target.value})}
                 >
                    <option value="">Select first product...</option>
                    {allProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku}) - ${p.unit_price}</option>)}
                 </select>
                 <Input 
                   type="number" min="1" className="w-20" placeholder="Qty"
                   value={newBundleParams.item1_qty}
                   onChange={e => setNewBundleParams({...newBundleParams, item1_qty: e.target.value})}
                 />
               </div>

               <Label className="font-semibold text-primary">Item 2</Label>
               <div className="flex gap-2">
                 <select 
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={newBundleParams.item2_id}
                    onChange={e => setNewBundleParams({...newBundleParams, item2_id: e.target.value})}
                 >
                    <option value="">Select second product...</option>
                    {allProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku}) - ${p.unit_price}</option>)}
                 </select>
                 <Input 
                   type="number" min="1" className="w-20" placeholder="Qty"
                   value={newBundleParams.item2_qty}
                   onChange={e => setNewBundleParams({...newBundleParams, item2_qty: e.target.value})}
                 />
               </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBundle} disabled={isCreating || !newBundleParams.item1_id || !newBundleParams.item2_id}>
              {isCreating ? <LoadingIcon size={14} className="animate-spin mr-2" /> : null}
              {isCreating ? "Creating..." : "Create Bundle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
