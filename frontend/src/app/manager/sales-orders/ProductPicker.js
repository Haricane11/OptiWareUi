"use client";

import React, { useState, useMemo } from "react";
import { 
  Search, 
  X, 
  Check, 
  Plus, 
  Package, 
  Tag as TagIcon,
  ChevronRight,
  Filter
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function ProductPicker({ 
  open, 
  onOpenChange, 
  products = [], 
  bundles = [],
  onSelect,
  existingItems = []
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [activeTab, setActiveTab] = useState("products"); // "products" or "bundles"

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ["All", ...Array.from(cats)].sort();
  }, [products]);

  // Filter products based on search and category
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const filteredBundles = useMemo(() => {
    return bundles.filter(b => 
      b.bundle_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [bundles, searchQuery]);

  const handleSelect = (item, type) => {
    onSelect(item, type);
  };

  const isAlreadyAdded = (id, type) => {
    if (type === 'product') {
      return existingItems.some(item => item.type === 'product' && item.product_id?.toString() === id?.toString());
    } else {
      return existingItems.some(item => item.type === 'bundle' && item.bundle_id?.toString() === id?.toString());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border/40 shadow-2xl glass-card">
        <DialogHeader className="p-6 pb-4 border-b border-border/40">
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Select Products
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                Browse and add products to your sales order.
              </DialogDescription>
            </div>
          </div>
          
          <div className="mt-6 space-y-4">
            <div className="flex p-1 rounded-full bg-muted/30 border border-border/40 w-fit shrink-0">
              <button
                onClick={() => setActiveTab("products")}
                className={cn(
                  "px-4 py-1 text-[10px] font-bold uppercase rounded-full transition-all",
                  activeTab === "products" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Products
              </button>
              <button
                onClick={() => setActiveTab("bundles")}
                className={cn(
                  "px-4 py-1 text-[10px] font-bold uppercase rounded-full transition-all",
                  activeTab === "bundles" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Bundles
              </button>
            </div>

            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by SKU or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-muted/20 border-border/40 focus:ring-primary/20 h-11"
              />
            </div>
            
            {activeTab === "products" && (
              <div className="flex gap-1.5 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
                {categories.map(cat => (
                  <Button
                    key={cat}
                    variant={selectedCategory === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "h-8 text-[11px] font-bold uppercase tracking-wider rounded-full px-4 shrink-0 transition-all",
                      selectedCategory === cat ? "bg-primary text-primary-foreground shadow-md" : "bg-muted/10 border-border/40 hover:bg-muted/30"
                    )}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {activeTab === "products" ? (
              filteredProducts.map((product) => (
                <div 
                  key={product.id}
                  className={cn(
                    "group relative p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between gap-3",
                    isAlreadyAdded(product.id, 'product') 
                      ? "bg-primary/5 border-primary/20" 
                      : "bg-muted/10 border-border/40 hover:bg-muted/20 hover:border-border/60 hover:shadow-lg hover:-translate-y-0.5"
                  )}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary tracking-tight px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 uppercase">
                          {product.sku}
                        </span>
                        {product.discount_value > 0 && (
                          <Badge variant="destructive" className="bg-destructive/15 text-destructive border-destructive/20 text-[10px] font-bold px-1.5 py-0 h-4">
                            {product.discount_type === 'PERCENTAGE' ? `-${product.discount_value}%` : `-$${product.discount_value}`}
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
                        {product.name}
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/20">
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Unit Price</p>
                      <div className="flex items-center gap-2">
                        <span className={cn("font-bold text-sm", product.discount_value > 0 && "text-muted-foreground line-through text-xs font-normal opacity-50")}>
                          ${parseFloat(product.unit_price).toFixed(2)}
                        </span>
                        {product.discount_value > 0 && (
                          <span className="font-bold text-sm text-foreground">
                            ${(product.discount_type === 'PERCENTAGE' 
                                ? product.unit_price * (1 - product.discount_value / 100) 
                                : Math.max(0, product.unit_price - product.discount_value)).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right space-y-0.5">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Stock</p>
                        <div className="flex items-center gap-1.5 justify-end">
                           <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                           <span className="text-xs font-bold text-emerald-500/90 tracking-tight">In Stock</span>
                        </div>
                      </div>

                      <Button 
                        size="sm" 
                        variant={isAlreadyAdded(product.id, 'product') ? "outline" : "default"}
                        onClick={() => handleSelect(product, 'product')}
                        className={cn(
                          "h-8 w-8 p-0 rounded-lg transition-all",
                          isAlreadyAdded(product.id, 'product') ? "opacity-50 pointer-events-none" : "hover:scale-105 shadow-md active:scale-95"
                        )}
                      >
                        {isAlreadyAdded(product.id, 'product') ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              filteredBundles.map((bundle) => (
                <div 
                  key={bundle.id}
                  className={cn(
                    "group relative p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between gap-3",
                    isAlreadyAdded(bundle.id, 'bundle') 
                      ? "bg-primary/5 border-primary/20" 
                      : "bg-muted/10 border-border/40 hover:bg-muted/20 hover:border-border/60 hover:shadow-lg hover:-translate-y-0.5"
                  )}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-primary tracking-tight px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 uppercase">
                          BUNDLE
                        </span>
                      </div>
                      <h4 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
                        {bundle.bundle_name}
                      </h4>
                      <p className="text-[10px] text-muted-foreground line-clamp-1 italic">
                        {bundle.items?.map(i => i.product_name).join(", ")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/20">
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Bundle Price</p>
                      <span className="font-bold text-sm text-foreground">
                        ${parseFloat(bundle.bundle_price).toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Button 
                        size="sm" 
                        variant={isAlreadyAdded(bundle.id, 'bundle') ? "outline" : "default"}
                        onClick={() => handleSelect(bundle, 'bundle')}
                        className={cn(
                          "h-8 w-8 p-0 rounded-lg transition-all",
                          isAlreadyAdded(bundle.id, 'bundle') ? "opacity-50 pointer-events-none" : "hover:scale-105 shadow-md active:scale-95"
                        )}
                      >
                        {isAlreadyAdded(bundle.id, 'bundle') ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {(activeTab === "products" ? filteredProducts : filteredBundles).length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Package className="h-12 w-12 mb-4 opacity-10" />
              <p className="text-sm font-medium">No products found for "{searchQuery}"</p>
              <Button 
                variant="link" 
                size="sm" 
                onClick={() => {setSearchQuery(""); setSelectedCategory("All");}}
                className="mt-2 text-primary"
              >
                Clear all filters
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 bg-muted/10 border-t border-border/40">
          <div className="flex justify-between items-center w-full">
            <p className="text-xs text-muted-foreground italic">
              * Showing {(activeTab === "products" ? filteredProducts : filteredBundles).length} results.
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg h-9 px-6 transition-all border-border/60 hover:bg-muted/50">
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
