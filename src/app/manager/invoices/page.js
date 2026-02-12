"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, CheckCircle2, Clock, XCircle, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

const invoices = [
  { id: "INV-3001", po: "PO-2401", supplier: "FreshCo Ltd.", date: "Feb 9, 2026", amount: "$3,240", items: 6, matched: 4, status: "partial" },
  { id: "INV-3000", po: "PO-2400", supplier: "SteelWorks Inc.", date: "Feb 8, 2026", amount: "$8,100", items: 3, matched: 3, status: "verified" },
  { id: "INV-2999", po: "PO-2399", supplier: "PackPro", date: "Feb 6, 2026", amount: "$1,560", items: 4, matched: 4, status: "verified" },
  { id: "INV-2998", po: "PO-2398", supplier: "OrganicFarms Co.", date: "Feb 5, 2026", amount: "$2,890", items: 8, matched: 8, status: "verified" },
  { id: "INV-2997", po: "PO-2397", supplier: "TechParts Global", date: "Feb 3, 2026", amount: "$4,200", items: 2, matched: 0, status: "disputed" },
];

const statusMap = {
  verified: { label: "Verified", style: "bg-success/10 text-success", icon: CheckCircle2 },
  partial: { label: "Partial Match", style: "bg-warning/10 text-warning", icon: Clock },
  disputed: { label: "Disputed", style: "bg-destructive/10 text-destructive", icon: XCircle },
};

export default function PurchaseInvoices() {
  const [search, setSearch] = useState("");

  const filtered = invoices.filter(inv =>
    inv.id.toLowerCase().includes(search.toLowerCase()) ||
    inv.supplier.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Purchase Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">Verify incoming invoices against purchase orders.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Verified", count: invoices.filter(i => i.status === "verified").length, color: "text-success bg-success/10" },
          { label: "Partial", count: invoices.filter(i => i.status === "partial").length, color: "text-warning bg-warning/10" },
          { label: "Disputed", count: invoices.filter(i => i.status === "disputed").length, color: "text-destructive bg-destructive/10" },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", s.color)}>
              <Receipt size={18} />
            </div>
            <div>
              <p className="text-xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                <th className="px-5 py-3 font-medium">Invoice</th>
                <th className="px-5 py-3 font-medium">PO Ref</th>
                <th className="px-5 py-3 font-medium">Supplier</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Items Matched</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, i) => {
                const st = statusMap[inv.status];
                const StatusIcon = st.icon;
                return (
                  <motion.tr key={inv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-medium">{inv.id}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{inv.po}</td>
                    <td className="px-5 py-3.5">{inv.supplier}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{inv.date}</td>
                    <td className="px-5 py-3.5 font-semibold">{inv.amount}</td>
                    <td className="px-5 py-3.5">
                      <span className={inv.matched === inv.items ? "text-success" : "text-warning"}>{inv.matched}/{inv.items}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1", st.style)}>
                        <StatusIcon size={12} />
                        {st.label}
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
