"use client";

import { DollarSign, Tag, Package, RotateCcw, Trash2, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";

const risks = [
  { alert: "🔴 Expiry (5d)", product: "Organic Milk (2L)", risk: "$450", recommendation: "Liquidation", action: "Markdown", icon: Tag },
  { alert: "⚫ Dead (180d)", product: "Screen Protector X", risk: "$2,100", recommendation: "Bundle Strategy", action: "Build Bundle", icon: Package },
  { alert: "🟡 Overstock", product: "Steel Rods (10mm)", risk: "$5,000", recommendation: "Supplier Reversal", action: "Start Return", icon: RotateCcw },
  { alert: "🔴 Expiry (12d)", product: "Fresh Yogurt Pack", risk: "$320", recommendation: "Discount", action: "Markdown", icon: Tag },
  { alert: "⚫ Dead (240d)", product: "USB-C Hub v1", risk: "$675", recommendation: "Disposal", action: "Dispose", icon: Trash2 },
];

const totalRisk = 8545;
const recovery = 3200;
const finalized = 1895;
const untreated = totalRisk - recovery - finalized;

export default function FinancialLoss() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financial Loss & Actions</h1>
        <p className="text-sm text-muted-foreground mt-1">Identify at-risk capital and execute recovery strategies.</p>
      </div>

      {/* Summary bar */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold flex items-center gap-2">
            <TrendingDown size={16} className="text-destructive" />
            Recovery Outlook
          </span>
          <span className="text-muted-foreground">Total at-risk: <span className="font-bold text-foreground">${totalRisk.toLocaleString()}</span></span>
        </div>
        <div className="flex h-4 rounded-full overflow-hidden bg-muted">
          <motion.div 
            initial={{ width: 0 }} 
            animate={{ width: `${(untreated / totalRisk) * 100}%` }} 
            transition={{ duration: 0.8 }} 
            className="bg-destructive" 
            title={`Untreated: $${untreated}`} 
          />
          <motion.div 
            initial={{ width: 0 }} 
            animate={{ width: `${(recovery / totalRisk) * 100}%` }} 
            transition={{ duration: 0.8, delay: 0.1 }} 
            className="bg-primary" 
            title={`Projected Recovery: $${recovery}`} 
          />
          <motion.div 
            initial={{ width: 0 }} 
            animate={{ width: `${(finalized / totalRisk) * 100}%` }} 
            transition={{ duration: 0.8, delay: 0.2 }} 
            className="bg-foreground/40" 
            title={`Finalized Loss: $${finalized}`} 
          />
        </div>
        <div className="flex flex-wrap gap-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive" /> Untreated ${untreated.toLocaleString()}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary" /> Recovery ${recovery.toLocaleString()}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-foreground/40" /> Finalized ${finalized.toLocaleString()}</span>
        </div>
      </div>

      {/* Decision grid */}
      <div className="glass-card rounded-xl p-5 overflow-x-auto">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <DollarSign size={16} className="text-primary" />
          Impact Table
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="pb-3 font-medium">Alert</th>
              <th className="pb-3 font-medium">Product</th>
              <th className="pb-3 font-medium">Capital at Risk</th>
              <th className="pb-3 font-medium">Recommendation</th>
              <th className="pb-3 font-medium">Quick Execute</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                <td className="py-3 text-xs">{r.alert}</td>
                <td className="py-3 font-medium">{r.product}</td>
                <td className="py-3 font-semibold text-destructive">{r.risk}</td>
                <td className="py-3 text-muted-foreground">{r.recommendation}</td>
                <td className="py-3">
                  <button className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    <r.icon size={13} />
                    {r.action}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
