"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Package, Database, Info, Warehouse, Layers, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getInventoryList } from "@/lib/api/inventory";

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedZone, setSelectedZone] = useState("all");
  const [selectedAisle, setSelectedAisle] = useState("all");
  const { toast } = useToast();

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const data = await getInventoryList();
      setInventory(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load inventory data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Get unique zones and aisles for filters
  const zones = ["all", ...new Set(inventory.map(item => item.zone_name).filter(Boolean))];
  const aisles = ["all", ...new Set(
    inventory
      .filter(item => selectedZone === "all" || item.zone_name === selectedZone)
      .map(item => item.aisle_num?.toString())
      .filter(Boolean)
  )].sort((a, b) => a === "all" ? -1 : parseInt(a) - parseInt(b));

  const filtered = inventory.filter(item => {
    const matchesSearch = 
      item.product_name.toLowerCase().includes(search.toLowerCase()) ||
      item.product_sku.toLowerCase().includes(search.toLowerCase()) ||
      item.shelf_code.toLowerCase().includes(search.toLowerCase());
    
    const matchesZone = selectedZone === "all" || item.zone_name === selectedZone;
    const matchesAisle = selectedAisle === "all" || item.aisle_num?.toString() === selectedAisle;

    return matchesSearch && matchesZone && matchesAisle;
  });

  // SKU Aggregation for Top Summary
  const skuAggregates = inventory.reduce((acc, item) => {
    const sku = item.product_sku;
    if (!acc[sku]) {
      acc[sku] = {
        name: item.product_name,
        sku: sku,
        totalQty: 0,
        totalPrice: 0,
        unitPrice: item.product_unit_price || 0
      };
    }
    acc[sku].totalQty += item.quantity;
    acc[sku].totalPrice += (item.quantity * (item.product_unit_price || 0));
    return acc;
  }, {});

  const skuList = Object.values(skuAggregates).sort((a, b) => b.totalQty - a.totalQty);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Global Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time stock levels and shelf utilization across all warehouses.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border border-primary/10 rounded-xl">
          <Database size={16} className="text-primary" />
          <span className="text-sm font-semibold">{inventory.length} Batches</span>
        </div>
      </div>

      {/* SKU Summary Section */}
      {!loading && skuList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {skuList.slice(0, 4).map((skuData, idx) => (
            <motion.div
              key={skuData.sku}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/10 relative overflow-hidden group"
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">SKU: {skuData.sku}</span>
                  <Package size={14} className="text-primary/40" />
                </div>
                <h4 className="font-bold text-sm truncate mb-3">{skuData.name}</h4>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-black">{skuData.totalQty.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground font-medium uppercase">Total Units</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-primary">${skuData.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-muted-foreground font-medium uppercase">Valuation</div>
                  </div>
                </div>
              </div>
              <div className="absolute top-0 right-0 -mr-4 -mt-4 opacity-[0.05] group-hover:scale-110 transition-transform duration-500">
                <Database size={80} />
              </div>
            </motion.div>
          ))}
          {skuList.length > 4 && (
             <div className="p-4 rounded-2xl border border-dashed border-border/50 flex items-center justify-center bg-muted/5">
                <span className="text-xs text-muted-foreground font-medium">+ {skuList.length - 4} more SKUs</span>
             </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full md:w-96">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            type="text" 
            placeholder="Search products, SKUs or shelves..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border/50 focus:ring-primary/20 transition-all rounded-xl" 
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Zone:</label>
          <select 
            value={selectedZone}
            onChange={(e) => { setSelectedZone(e.target.value); setSelectedAisle("all"); }}
            className="bg-card border border-border/50 rounded-xl px-3 py-2 text-sm focus:ring-primary/20 transition-all outline-none min-w-[120px]"
          >
            {zones.map(z => (
              <option key={z} value={z}>{z === "all" ? "All Zones" : `Zone ${z}`}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Aisle:</label>
          <select 
            value={selectedAisle}
            onChange={(e) => setSelectedAisle(e.target.value)}
            className="bg-card border border-border/50 rounded-xl px-3 py-2 text-sm focus:ring-primary/20 transition-all outline-none min-w-[120px]"
          >
            {aisles.map(a => (
              <option key={a} value={a}>{a === "all" ? "All Aisles" : `Aisle ${a}`}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card/50 rounded-2xl border border-dashed border-border/50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading inventory states...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border border-dashed border-border/50">
            <Package size={40} className="text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">No matching inventory found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item, i) => {
              // Calculate shelf usage percentage
              const usagePerc = item.shelf_total_volume > 0 
                ? (item.total_volume / item.shelf_total_volume) * 100 
                : 0;
              
              const isLowStock = item.available < 10;
              const isExpiringSoon = item.expiry_date && new Date(item.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card rounded-2xl p-5 border border-border/50 hover:border-primary/30 transition-all group relative overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">{item.product_name}</h3>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground opacity-70 uppercase tracking-wider">{item.product_sku}</p>
                    </div>
                    <Badge variant={item.status === "ACTIVE" ? "success" : "secondary"} className="rounded-full shadow-sm">
                      {item.status}
                    </Badge>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-xl bg-muted/30 border border-border/30 flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Quantity</span>
                        <div className="flex items-end gap-1.5">
                          <span className="text-xl font-black leading-none">{item.quantity}</span>
                          <span className="text-[10px] text-muted-foreground mb-1">units</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-muted/30 border border-border/30 flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Available</span>
                        <div className="flex items-end gap-1.5">
                          <span className={cn("text-xl font-black leading-none", isLowStock ? "text-destructive" : "text-primary")}>
                            {item.available}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-tight">
                          <Layers size={14} className="text-primary" />
                          Shelf usage
                        </div>
                        <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          {usagePerc.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={usagePerc} className="h-2 rounded-full bg-muted/40" indicatorClassName="gradient-primary shadow-lg" />
                      <div className="flex justify-between mt-1.5 px-0.5">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Info size={10} /> Vol: {item.total_volume?.toFixed(2)} m³
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground">{item.shelf_code} ({item.zone_name})</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border/40 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Warehouse size={12} strokeWidth={2.5} />
                        <span className="font-medium truncate max-w-[120px]">{item.warehouse_name}</span>
                      </div>
                      {item.expiry_date && (
                        <div className={cn(
                          "flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg",
                          isExpiringSoon ? "bg-red-500/10 text-red-600" : "bg-muted/50 text-muted-foreground"
                        )}>
                          Exp: {new Date(item.expiry_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Micro-animation background element */}
                  <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity rotate-12 group-hover:rotate-0 duration-500">
                    <Package size={120} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
