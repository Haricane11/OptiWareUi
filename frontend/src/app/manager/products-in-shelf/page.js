"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Search,
  Package,
  MapPin,
  RefreshCw,
  Layers,
  TrendingUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { getInventoryShelfView } from "@/lib/api/receiving";
import { useWms } from "../../../context/WmsContext";

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_COLOURS = {
  available:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  reserved:    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  quarantine:  "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  depleted:    "bg-gray-100 text-gray-500",
};

const TURNOVER_COLOURS = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low:    "bg-sky-100 text-sky-700",
};

function StatusBadge({ value }) {
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLOURS[value] || "bg-gray-100 text-gray-600")}>
      {value}
    </span>
  );
}

function TurnoverBadge({ value }) {
  const v = (value || "").toLowerCase();
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", TURNOVER_COLOURS[v] || "bg-gray-100 text-gray-600")}>
      {v || "—"}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ProductsInShelfPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { state } = useWms();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");

  const warehouses = state.warehouses || [];

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getInventoryShelfView(selectedWarehouse || null);
      setRows(data);
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedWarehouse]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.sku?.toLowerCase().includes(q) ||
        r.product_name?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q) ||
        r.shelf_code?.toLowerCase().includes(q) ||
        r.zone_name?.toLowerCase().includes(q) ||
        r.batch_number?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Summary stats
  const totalQty     = rows.reduce((s, r) => s + (r.quantity || 0), 0);
  const totalShelves = new Set(rows.map((r) => r.shelf_id)).size;
  const totalSkus    = new Set(rows.map((r) => r.sku)).size;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col h-full p-6 bg-background rounded-lg shadow-md gap-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              Products in Shelf
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live inventory placement — showing where every product batch is stored
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Package,   label: "Unique SKUs",   value: totalSkus },
          { icon: Layers,    label: "Total Quantity", value: totalQty.toLocaleString() },
          { icon: MapPin,    label: "Shelves Used",   value: totalShelves },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-4 shadow-sm">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search SKU, product, zone, shelf..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {warehouses.length > 0 && (
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} row{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto border rounded-lg">
        <Table className="min-w-full text-sm">
          <TableHeader className="sticky top-0 bg-secondary z-10">
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="text-center">Available</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Shelf Code</TableHead>
              <TableHead className="text-center">Aisle</TableHead>
              <TableHead className="text-center">Bay</TableHead>
              <TableHead className="text-center">Level</TableHead>
              <TableHead>Turnover</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Loading inventory…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  {rows.length === 0
                    ? "No inventory placed yet. Scan products to begin automatic placement."
                    : "No results match your search."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.inventory_id} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="font-mono font-medium text-primary">{row.sku}</TableCell>
                  <TableCell className="max-w-[180px] truncate" title={row.product_name}>
                    {row.product_name}
                  </TableCell>
                  <TableCell>{row.category || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.batch_number}</TableCell>
                  <TableCell className="text-center font-semibold">{row.quantity}</TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      "font-semibold",
                      row.available < row.quantity * 0.2 ? "text-red-500" : "text-emerald-600"
                    )}>
                      {row.available}
                    </span>
                  </TableCell>
                  <TableCell>{row.zone_name}</TableCell>
                  <TableCell className="font-mono font-medium">{row.shelf_code}</TableCell>
                  <TableCell className="text-center">{row.aisle_num ?? "—"}</TableCell>
                  <TableCell className="text-center">{row.bay_num ?? "—"}</TableCell>
                  <TableCell className="text-center">{row.level_num ?? "—"}</TableCell>
                  <TableCell><TurnoverBadge value={row.turnover_rate} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.expiry_date
                      ? new Date(row.expiry_date).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell><StatusBadge value={row.inventory_status} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </motion.div>
  );
}
