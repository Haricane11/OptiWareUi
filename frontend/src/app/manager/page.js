"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, TrendingDown, Package, Truck, DollarSign,
  ArrowUpRight, ArrowDownRight, Clock, BarChart3, RefreshCw,
} from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const alertColor = {
  LOW_STOCK: "bg-destructive/10 text-destructive",
  DEAD: "bg-foreground/10 text-foreground",
  EXPIRY_RISK: "bg-warning/10 text-warning",
  SLOW_MOVING: "bg-warning/10 text-warning",
  DORMANT: "bg-foreground/10 text-foreground",
};

const alertLabel = {
  LOW_STOCK: "Low",
  DEAD: "Dead",
  EXPIRY_RISK: "Expiry",
  SLOW_MOVING: "Slow",
  DORMANT: "Dormant",
};

const poStatusColor = {
  pending: "bg-warning/10 text-warning",
  in_transit: "bg-primary/10 text-primary",
  delivered: "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

function normalizePOStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (["in_transit", "in-transit", "shipping", "shipped"].includes(s)) return "in_transit";
  if (["delivered", "received", "completed"].includes(s)) return "delivered";
  if (["cancelled", "canceled", "void"].includes(s)) return "cancelled";
  return "pending";
}

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMoney(n) {
  const num = Number(n || 0);
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// Skeleton pulse loader
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-muted/60 rounded-lg ${className}`} />;
}

function StatCard({ label, value, change, up, icon: Icon, loading }) {
  if (loading) {
    return (
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-8 w-24 mb-1" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }
  return (
    <div className="glass-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon size={18} className="text-primary" />
        </div>
        {change !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-success" : "text-destructive"}`}>
            {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {change}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function ManagerDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data state
  const [products, setProducts] = useState([]);
  const [healthReport, setHealthReport] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodsRes, healthRes, posRes, whsRes] = await Promise.allSettled([
        fetchJson("/products"),
        fetchJson("/analytics/health-report"),
        fetchJson("/purchase-orders"),
        fetchJson("/warehouses"),
      ]);

      if (prodsRes.status === "fulfilled") setProducts(Array.isArray(prodsRes.value) ? prodsRes.value : []);
      if (healthRes.status === "fulfilled") setHealthReport(healthRes.value);
      if (posRes.status === "fulfilled") setPurchaseOrders(Array.isArray(posRes.value) ? posRes.value : []);
      if (whsRes.status === "fulfilled") setWarehouses(Array.isArray(whsRes.value) ? whsRes.value : []);

      // Show a soft warning if health report failed (non-blocking)
      const failures = [prodsRes, healthRes, posRes, whsRes].filter(r => r.status === "rejected");
      if (failures.length === 4) {
        setError("Failed to load dashboard data. Check that the backend is running.");
      }
    } catch (e) {
      setError(e?.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ── Derived values ────────────────────────────────────────────────
  const totalProducts = products.length;
  const lowStockCount = healthReport?.low_stock_count ?? 0;
  const atRiskCapital = healthReport?.total_value_at_risk ?? 0;
  const pendingOrders = purchaseOrders.filter(
    (po) => normalizePOStatus(po.status) === "pending"
  ).length;

  // Build alerts list: low stock first, then dead, then expiry/slow
  const activeAlerts = (() => {
    if (!healthReport) return [];
    const all = [];
    (healthReport.low_stock_items || []).forEach((item) =>
      all.push({ ...item, alertType: "LOW_STOCK" })
    );
    (healthReport.dead_stock_items || []).forEach((item) =>
      all.push({ ...item, alertType: "DEAD" })
    );
    (healthReport.slow_moving_items || []).forEach((item) =>
      all.push({ ...item, alertType: "SLOW_MOVING" })
    );
    (healthReport.expiry_risk_items || []).forEach((item) =>
      all.push({ ...item, alertType: "EXPIRY_RISK" })
    );
    return all.slice(0, 6);
  })();

  // Recent orders (latest 5)
  const recentOrders = purchaseOrders.slice(0, 5).map((po) => ({
    id: po.po_number || `PO-${po.id}`,
    supplier: po.supplier_name || "—",
    items: Number(po.items_count || 0),
    status: normalizePOStatus(po.status),
    date: formatDate(po.created_at),
  }));

  // Warehouse occupancy derived from zones/shelves in the warehouse hierarchy
  const warehouseOccupancy = (() => {
    if (!warehouses.length) return [];
    const zones = [];
    warehouses.forEach((wh) => {
      const floors = Array.isArray(wh.floors) ? wh.floors : [];
      floors.forEach((floor) => {
        const floorZones = Array.isArray(floor.zones) ? floor.zones : [];
        floorZones.forEach((zone) => {
          const shelves = Array.isArray(zone.shelves) ? zone.shelves : [];
          if (!shelves.length) return;
          const totalShelves = shelves.length;
          // A shelf is "occupied" if it has weight on it
          const occupiedShelves = shelves.filter(
            (s) => Number(s.current_weight || 0) > 0
          ).length;
          const pct = Math.round((occupiedShelves / totalShelves) * 100);
          zones.push({ zone: zone.zone_name || `Zone ${zone.id}`, pct });
        });
      });
    });
    // If no granular zone data fallback to warehouse-level summary
    if (!zones.length) {
      return warehouses.slice(0, 4).map((wh) => ({ zone: wh.name || `Warehouse ${wh.id}`, pct: 0 }));
    }
    return zones.slice(0, 4);
  })();

  const overallPct = warehouseOccupancy.length
    ? Math.round(
        warehouseOccupancy.reduce((s, w) => s + w.pct, 0) / warehouseOccupancy.length
      )
    : 0;

  const stats = [
    {
      label: "Total Products",
      value: loading ? "—" : totalProducts.toLocaleString(),
      icon: Package,
    },
    {
      label: "Low Stock Alerts",
      value: loading ? "—" : String(lowStockCount),
      icon: AlertTriangle,
      up: false,
    },
    {
      label: "Pending Orders",
      value: loading ? "—" : String(pendingOrders),
      icon: Truck,
    },
    {
      label: "At-Risk Capital",
      value: loading ? "—" : formatMoney(atRiskCapital),
      icon: DollarSign,
      up: false,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back &mdash; here&apos;s your warehouse at a glance.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/60 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3 border border-destructive/20">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
          >
            <StatCard {...stat} loading={loading} />
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Stock Alerts */}
        <div className="lg:col-span-2 glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-warning" />
              Active Alerts
            </h2>
            <span className="text-xs text-muted-foreground">
              {loading ? "…" : `${activeAlerts.length} items need attention`}
            </span>
          </div>

          {loading ? (
            <div className="space-y-2.5">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : activeAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No active alerts — inventory is healthy! 🎉
            </p>
          ) : (
            <div className="space-y-2.5">
              {activeAlerts.map((alert, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        alertColor[alert.alertType] || "bg-muted text-muted-foreground"
                      }`}
                    >
                      {alertLabel[alert.alertType] || alert.alertType}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{alert.product_name || alert.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        SKU: {alert.sku || "—"}
                        {alert.shelf_code ? ` · ${alert.shelf_code}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {alert.value_at_risk != null && (
                      <p className="text-sm font-semibold text-destructive">
                        {formatMoney(alert.value_at_risk)}
                      </p>
                    )}
                    {alert.days_until_expiry != null && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                        <Clock size={10} />
                        {alert.days_until_expiry}d left
                      </p>
                    )}
                    {alert.quantity != null && alert.alertType === "LOW_STOCK" && (
                      <p className="text-[10px] text-muted-foreground">
                        Qty: {alert.quantity}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Warehouse Occupancy */}
        <div className="glass-card rounded-xl p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-primary" />
            Warehouse Occupancy
          </h2>

          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                  <Skeleton className="h-2 rounded-full" />
                </div>
              ))}
            </div>
          ) : warehouseOccupancy.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No warehouse data available.
            </p>
          ) : (
            <div className="space-y-4">
              {warehouseOccupancy.map((zone) => (
                <div key={zone.zone}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium truncate pr-2">{zone.zone}</span>
                    <span
                      className={`text-xs font-bold flex-shrink-0 ${
                        zone.pct > 80
                          ? "text-destructive"
                          : zone.pct > 60
                          ? "text-warning"
                          : "text-success"
                      }`}
                    >
                      {zone.pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${zone.pct}%` }}
                      transition={{ duration: 0.8, delay: 0.3 }}
                      className={`h-full rounded-full ${
                        zone.pct > 80
                          ? "bg-destructive"
                          : zone.pct > 60
                          ? "bg-warning"
                          : "bg-primary"
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && warehouseOccupancy.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Overall</span>
                <span className="font-bold">{overallPct}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Truck size={16} className="text-primary" />
            Recent Purchase Orders
          </h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No purchase orders found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-3 font-medium">Order ID</th>
                  <th className="pb-3 font-medium">Supplier</th>
                  <th className="pb-3 font-medium">Items</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-3 font-mono text-xs font-medium">{order.id}</td>
                    <td className="py-3">{order.supplier}</td>
                    <td className="py-3">{order.items}</td>
                    <td className="py-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
                          poStatusColor[order.status] || "bg-muted text-muted-foreground"
                        }`}
                      >
                        {order.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">{order.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
