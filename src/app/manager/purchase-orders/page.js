"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Eye, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const orders = [
  { id: "PO-2401", supplier: "FreshCo Ltd.", date: "Feb 8, 2026", items: 6, total: "$3,240", status: "pending", eta: "Feb 12" },
  { id: "PO-2400", supplier: "SteelWorks Inc.", date: "Feb 7, 2026", items: 3, total: "$8,100", status: "in_transit", eta: "Feb 10" },
  { id: "PO-2399", supplier: "PackPro", date: "Feb 5, 2026", items: 4, total: "$1,560", status: "delivered", eta: "—" },
  { id: "PO-2398", supplier: "OrganicFarms Co.", date: "Feb 4, 2026", items: 8, total: "$2,890", status: "delivered", eta: "—" },
  { id: "PO-2397", supplier: "TechParts Global", date: "Feb 2, 2026", items: 2, total: "$4,200", status: "delivered", eta: "—" },
  { id: "PO-2396", supplier: "BuildRight Supply", date: "Jan 30, 2026", items: 5, total: "$6,750", status: "cancelled", eta: "—" },
];

const statusMap = {
  pending: { label: "Pending", style: "bg-warning/10 text-warning" },
  in_transit: { label: "In Transit", style: "bg-primary/10 text-primary" },
  delivered: { label: "Delivered", style: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", style: "bg-destructive/10 text-destructive" },
};

const itemsDetail = {
  "PO-2401": [
    { product: "Organic Milk (2L)", qty: 200, unit: "cartons", price: "$800" },
    { product: "Fresh Yogurt Pack", qty: 150, unit: "packs", price: "$675" },
    { product: "Butter 250g", qty: 100, unit: "blocks", price: "$450" },
    { product: "Cheese Block", qty: 80, unit: "blocks", price: "$560" },
    { product: "Cream 500ml", qty: 120, unit: "bottles", price: "$480" },
    { product: "Eggs Pack", qty: 50, unit: "trays", price: "$275" },
  ],
};

export default function PurchaseOrders() {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  const filtered = orders.filter(o =>
    o.id.toLowerCase().includes(search.toLowerCase()) ||
    o.supplier.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">{orders.length} orders · {orders.filter(o => o.status === "pending" || o.status === "in_transit").length} active</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-medium shadow-sm hover:opacity-90 transition-opacity">
          <Plus size={16} />
          New Order
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" placeholder="Search orders..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
      </div>

      <div className="space-y-3">
        {filtered.map((order, i) => {
          const st = statusMap[order.status];
          const details = itemsDetail[order.id];
          const isOpen = expanded === order.id;
          return (
            <motion.div key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="glass-card rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setExpanded(isOpen ? null : order.id)}>
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{order.id} <span className="text-muted-foreground font-normal">— {order.supplier}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">{order.items} items · {order.total} · {order.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {order.eta !== "—" && <span className="text-xs text-muted-foreground hidden sm:block">ETA: {order.eta}</span>}
                  <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", st.style)}>{st.label}</span>
                  <Eye size={15} className={cn("text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </div>
              </div>
              {isOpen && details && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t border-border px-4 pb-4">
                  <table className="w-full text-sm mt-3">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="text-left pb-2 font-medium">Product</th>
                        <th className="text-left pb-2 font-medium">Qty</th>
                        <th className="text-left pb-2 font-medium">Unit</th>
                        <th className="text-left pb-2 font-medium">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((d, j) => (
                        <tr key={j} className="border-t border-border/30">
                          <td className="py-2">{d.product}</td>
                          <td className="py-2">{d.qty}</td>
                          <td className="py-2">{d.unit}</td>
                          <td className="py-2">{d.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-end gap-3 mt-4">
                    <button className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">Download PDF</button>
                    <button className="text-xs font-medium px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground shadow-sm">View Full Details</button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
