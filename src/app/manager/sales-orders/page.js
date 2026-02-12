"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, FileOutput, Truck, CheckCircle2, Clock, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const ordersData = [
  { id: "SO-1105", customer: "RetailMax", date: "Feb 7, 2026", items: [{ product: "Organic Milk (2L)", qty: 100 }, { product: "Fresh Yogurt", qty: 60 }, { product: "Butter 250g", qty: 40 }], total: "$2,450", status: "ready", deliveryNote: null },
  { id: "SO-1104", customer: "QuickMart", date: "Feb 6, 2026", items: [{ product: "Canned Tuna 200g", qty: 200 }, { product: "Rice 5kg", qty: 50 }], total: "$1,870", status: "processing", deliveryNote: null },
  { id: "SO-1103", customer: "GreenGrocer", date: "Feb 5, 2026", items: [{ product: "Eggs Pack", qty: 80 }, { product: "Cheese Block", qty: 30 }], total: "$1,120", status: "shipped", deliveryNote: "DN-4501" },
  { id: "SO-1102", customer: "TechStore Plus", date: "Feb 4, 2026", items: [{ product: "USB-C Hub v1", qty: 25 }], total: "$750", status: "shipped", deliveryNote: "DN-4500" },
  { id: "SO-1101", customer: "ConstructCo", date: "Feb 3, 2026", items: [{ product: "Steel Rods (10mm)", qty: 100 }, { product: "Bolts M8", qty: 300 }], total: "$4,200", status: "pending", deliveryNote: null },
];

const statusMap = {
  pending: { label: "Pending", style: "bg-warning/10 text-warning" },
  processing: { label: "Processing", style: "bg-primary/10 text-primary" },
  ready: { label: "Ready to Ship", style: "bg-success/10 text-success" },
  shipped: { label: "Shipped", style: "bg-muted text-muted-foreground" },
};

export default function SalesOrders() {
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [createdNotes, setCreatedNotes] = useState({});

  const filtered = ordersData.filter(o =>
    o.id.toLowerCase().includes(search.toLowerCase()) ||
    o.customer.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateDeliveryNote = (orderId) => {
    const noteId = `DN-${4502 + Object.keys(createdNotes).length}`;
    setCreatedNotes(prev => ({ ...prev, [orderId]: noteId }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and fulfill customer orders.</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" placeholder="Search orders..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Order list */}
        <div className="lg:col-span-3 space-y-3">
          {filtered.map((order, i) => {
            const st = statusMap[order.status];
            const note = order.deliveryNote || createdNotes[order.id];
            return (
              <motion.div key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={cn("glass-card rounded-xl p-4 cursor-pointer transition-all hover:border-primary/30",
                  selectedOrder?.id === order.id && "border-primary/40 shadow-md"
                )}
                onClick={() => setSelectedOrder(order)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium">{order.id}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", st.style)}>{st.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{order.date}</span>
                </div>
                <p className="text-sm font-medium">{order.customer}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted-foreground">{order.items.length} items · {order.total}</p>
                  {note && (
                    <span className="text-xs font-mono text-primary flex items-center gap-1">
                      <FileOutput size={12} /> {note}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {selectedOrder ? (
            <div className="glass-card rounded-xl p-5 sticky top-8 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">{selectedOrder.id}</h2>
                <span className="text-xs text-muted-foreground">{selectedOrder.date}</span>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Customer</p>
                <p className="font-medium mt-0.5">{selectedOrder.customer}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Order Items</p>
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                    <span>{item.product}</span>
                    <span className="font-medium">x{item.qty}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-2">
                  <span>Total</span>
                  <span className="text-primary">{selectedOrder.total}</span>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                {selectedOrder.status === "ready" && !selectedOrder.deliveryNote && !createdNotes[selectedOrder.id] ? (
                  <button 
                    onClick={() => handleCreateDeliveryNote(selectedOrder.id)}
                    className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground font-medium shadow-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <FileOutput size={16} />
                    Generate Delivery Note
                  </button>
                ) : (
                  <button className="w-full py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2">
                    <Truck size={16} />
                    Track Shipment
                  </button>
                )}
                <button className="w-full py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors">
                  Contact Customer
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 glass-card rounded-xl border-dashed">
              <div className="p-3 rounded-full bg-muted mb-4">
                <Package size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Select an order to view details and fulfillment options.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
