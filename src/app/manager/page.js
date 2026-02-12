"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle, TrendingDown, Package, Truck, DollarSign,
  ArrowUpRight, ArrowDownRight, Clock, BarChart3,
} from "lucide-react";

const stats = [
  { label: "Total Products", value: "2,847", change: "+12%", up: true, icon: Package },
  { label: "Low Stock Alerts", value: "14", change: "+3", up: false, icon: AlertTriangle },
  { label: "Pending Orders", value: "8", change: "-2", up: true, icon: Truck },
  { label: "At-Risk Capital", value: "$7,550", change: "+$1,200", up: false, icon: DollarSign },
];

const recentAlerts = [
  { type: "low", product: "Organic Milk (2L)", shelf: "A3-L2", daysLeft: 5, risk: "$450" },
  { type: "dead", product: "Screen Protector X", shelf: "C1-L4", daysLeft: 180, risk: "$2,100" },
  { type: "expiring", product: "Fresh Yogurt Pack", shelf: "A1-L1", daysLeft: 12, risk: "$320" },
  { type: "low", product: "Steel Rods (10mm)", shelf: "D2-L3", daysLeft: null, risk: "$5,000" },
];

const recentOrders = [
  { id: "PO-2401", supplier: "FreshCo Ltd.", items: 24, status: "Pending", date: "Feb 8" },
  { id: "PO-2400", supplier: "SteelWorks Inc.", items: 12, status: "In Transit", date: "Feb 7" },
  { id: "SO-1105", supplier: "RetailMax", items: 36, status: "Ready", date: "Feb 7" },
  { id: "PO-2399", supplier: "PackPro", items: 8, status: "Delivered", date: "Feb 6" },
];

const alertColor = {
  low: "bg-destructive/10 text-destructive",
  dead: "bg-foreground/10 text-foreground",
  expiring: "bg-warning/10 text-warning",
};

const statusColor = {
  Pending: "bg-warning/10 text-warning",
  "In Transit": "bg-primary/10 text-primary",
  Ready: "bg-success/10 text-success",
  Delivered: "bg-muted text-muted-foreground",
};

const warehouseOccupancy = [
  { zone: "Zone A", pct: 85 },
  { zone: "Zone B", pct: 62 },
  { zone: "Zone C", pct: 44 },
  { zone: "Zone D", pct: 91 },
];

export default function ManagerDashboard() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back — here's your warehouse at a glance.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="glass-card rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <stat.icon size={18} className="text-primary" />
              </div>
              <span className={`flex items-center gap-0.5 text-xs font-medium ${stat.up ? "text-success" : "text-destructive"}`}>
                {stat.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {stat.change}
              </span>
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
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
            <span className="text-xs text-muted-foreground">4 items need attention</span>
          </div>
          <div className="space-y-2.5">
            {recentAlerts.map((alert, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${alertColor[alert.type]}`}>
                    {alert.type === "low" ? "Low" : alert.type === "dead" ? "Dead" : "Expiry"}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{alert.product}</p>
                    <p className="text-xs text-muted-foreground">{alert.shelf}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-destructive">{alert.risk}</p>
                  {alert.daysLeft !== null && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                      <Clock size={10} />
                      {alert.daysLeft}d left
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Warehouse Occupancy */}
        <div className="glass-card rounded-xl p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-primary" />
            Warehouse Occupancy
          </h2>
          <div className="space-y-4">
            {warehouseOccupancy.map((zone) => (
              <div key={zone.zone}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{zone.zone}</span>
                  <span className={`text-xs font-bold ${
                    zone.pct > 80 ? "text-destructive" : zone.pct > 60 ? "text-warning" : "text-success"
                  }`}>{zone.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${zone.pct}%` }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                    className={`h-full rounded-full ${
                      zone.pct > 80 ? "bg-destructive" : zone.pct > 60 ? "bg-warning" : "bg-primary"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-border">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Overall</span>
              <span className="font-bold">70.5%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Truck size={16} className="text-primary" />
            Recent Orders
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="pb-3 font-medium">Order ID</th>
                <th className="pb-3 font-medium">Supplier / Customer</th>
                <th className="pb-3 font-medium">Items</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-3 font-mono text-xs font-medium">{order.id}</td>
                  <td className="py-3">{order.supplier}</td>
                  <td className="py-3">{order.items}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[order.status]}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="py-3 text-muted-foreground">{order.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
