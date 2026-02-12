"use client";

import { motion } from "framer-motion";
import { Package, ScanLine, CheckCircle2, Clock, AlertCircle } from "lucide-react";

const pendingItems = [
  { id: "BOX-2401-A", product: "Organic Milk (2L)", qty: 50, invoice: "INV-001", status: "pending" },
  { id: "BOX-2401-B", product: "Fresh Yogurt Pack", qty: 80, invoice: "INV-001", status: "matched" },
  { id: "BOX-2402-A", product: "Steel Rods (10mm)", qty: 200, invoice: "INV-002", status: "pending" },
  { id: "BOX-2402-B", product: "Bolts M8", qty: 500, invoice: "INV-002", status: "pending" },
];

const statusConfig = {
  pending: { icon: Clock, color: "text-warning", label: "Pending Scan" },
  matched: { icon: CheckCircle2, color: "text-success", label: "Matched" },
  mismatch: { icon: AlertCircle, color: "text-destructive", label: "Mismatch" },
};

export default function StaffReceive() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Receive Products</h2>
        <p className="text-sm text-muted-foreground mt-1">Scan QR codes to verify incoming deliveries.</p>
      </div>

      {/* Scan button */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        className="w-full gradient-primary rounded-2xl p-6 flex flex-col items-center gap-3 text-primary-foreground shadow-lg"
      >
        <ScanLine size={40} strokeWidth={1.5} />
        <span className="font-semibold text-lg">Scan Product QR</span>
        <span className="text-sm opacity-80">Point camera at product box</span>
      </motion.button>

      {/* Pending items */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Package size={16} className="text-primary" />
          Incoming Items ({pendingItems.length})
        </h3>
        <div className="space-y-2.5">
          {pendingItems.map((item, i) => {
            const s = statusConfig[item.status];
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="glass-card rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-sm">{item.product}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{item.id}</span>
                    <span>·</span>
                    <span>Qty: {item.qty}</span>
                    <span>·</span>
                    <span>{item.invoice}</span>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${s.color}`}>
                  <s.icon size={14} />
                  <span>{s.label}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
