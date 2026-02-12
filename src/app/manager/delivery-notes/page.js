"use client";

import { motion } from "framer-motion";
import { Search, Truck, CheckCircle2, Clock, Package } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const notes = [
  { id: "DN-4501", so: "SO-1103", customer: "GreenGrocer", date: "Feb 6, 2026", items: 2, status: "delivered", driver: "Mike T." },
  { id: "DN-4500", so: "SO-1102", customer: "TechStore Plus", date: "Feb 5, 2026", items: 1, status: "delivered", driver: "Sarah L." },
  { id: "DN-4499", so: "SO-1100", customer: "FoodHub", date: "Feb 4, 2026", items: 5, status: "in_transit", driver: "Carlos R." },
  { id: "DN-4498", so: "SO-1099", customer: "BuildMart", date: "Feb 3, 2026", items: 3, status: "in_transit", driver: "Jake W." },
  { id: "DN-4497", so: "SO-1098", customer: "MegaStore", date: "Feb 2, 2026", items: 7, status: "delivered", driver: "Mike T." },
];

const statusMap = {
  delivered: { label: "Delivered", style: "bg-success/10 text-success", icon: CheckCircle2 },
  in_transit: { label: "In Transit", style: "bg-primary/10 text-primary", icon: Truck },
  pending: { label: "Pending", style: "bg-warning/10 text-warning", icon: Clock },
};

export default function DeliveryNotes() {
  const [search, setSearch] = useState("");

  const filtered = notes.filter(n =>
    n.id.toLowerCase().includes(search.toLowerCase()) ||
    n.customer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Delivery Notes</h1>
        <p className="text-sm text-muted-foreground mt-1">Track outbound deliveries and shipment status.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "In Transit", count: notes.filter(n => n.status === "in_transit").length, icon: Truck, color: "text-primary bg-primary/10" },
          { label: "Delivered", count: notes.filter(n => n.status === "delivered").length, icon: CheckCircle2, color: "text-success bg-success/10" },
          { label: "Total Notes", count: notes.length, icon: Package, color: "text-foreground bg-muted" },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", s.color)}><s.icon size={18} /></div>
            <div>
              <p className="text-xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Search delivery notes..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" 
        />
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                <th className="px-5 py-3 font-medium">Note ID</th>
                <th className="px-5 py-3 font-medium">Sales Order</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Items</th>
                <th className="px-5 py-3 font-medium">Driver</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((note, i) => {
                const st = statusMap[note.status];
                return (
                  <motion.tr 
                    key={note.id} 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs font-medium">{note.id}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{note.so}</td>
                    <td className="px-5 py-3.5">{note.customer}</td>
                    <td className="px-5 py-3.5">{note.items}</td>
                    <td className="px-5 py-3.5">{note.driver}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{note.date}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1", st.style)}>
                        <st.icon size={12} />{st.label}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
