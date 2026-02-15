"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, CheckCircle2, Clock, XCircle, Receipt, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const statusMap = {
  Approved: { label: "Approved", style: "bg-success/10 text-success", icon: CheckCircle2 },
  Paid: { label: "Paid", style: "bg-success/10 text-success", icon: CheckCircle2 },
  Pending: { label: "Pending", style: "bg-warning/10 text-warning", icon: Clock },
  Disputed: { label: "Disputed", style: "bg-destructive/10 text-destructive", icon: XCircle },
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function money(n) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function PurchaseInvoices() {
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState("");

  const [open, setOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedError, setSelectedError] = useState("");

  const summary = useMemo(() => {
    const counts = { success: 0, pending: 0, disputed: 0 };
    for (const inv of invoices) {
      const st = inv?.invoice_status;
      if (st === "Approved" || st === "Paid") counts.success += 1;
      else if (st === "Disputed") counts.disputed += 1;
      else counts.pending += 1;
    }
    return counts;
  }, [invoices]);

  async function fetchInvoices() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchase-invoices`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load invoices (${res.status})`);
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  async function openDetails(invoiceId) {
    setOpen(true);
    setSelected(null);
    setSelectedError("");
    setDetailLoading(true);

    try {
      const res = await fetch(`${API_BASE}/purchase-invoices/${invoiceId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load invoice (${res.status})`);
      const data = await res.json();
      setSelected(data);
    } catch (e) {
      setSelectedError(e?.message || "Failed to load invoice detail");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return invoices;
    return invoices.filter((inv) =>
      (inv?.invoice_number || "").toLowerCase().includes(s) ||
      (inv?.po_number || "").toLowerCase().includes(s) ||
      (inv?.supplier?.name || "").toLowerCase().includes(s)
    );
  }, [invoices, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Purchase Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verify incoming invoices against purchase orders.
        </p>
      </div>

     {/* Summary (responsive) */}
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
  {[
    { label: "Approved/Paid", labelMobile: "Approved", count: summary.success, color: "text-success bg-success/10" },
    { label: "Pending", labelMobile: "Pending", count: summary.pending, color: "text-warning bg-warning/10" },
    { label: "Disputed", labelMobile: "Disputed", count: summary.disputed, color: "text-destructive bg-destructive/10" },
  ].map((s) => (
    <div key={s.label} className="glass-card rounded-xl p-4 flex items-center gap-3">
      <div className={cn("p-2 sm:p-2.5 rounded-xl shrink-0", s.color)}>
        <Receipt size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold">{s.count}</p>
        <p className="text-xs text-muted-foreground leading-tight break-words">
          <span className="sm:hidden">{s.labelMobile}</span>
          <span className="hidden sm:inline">{s.label}</span>
        </p>
      </div>
    </div>
  ))}
</div>


      {/* Search + Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>

        <Button variant="outline" className="rounded-xl w-fit" onClick={fetchInvoices} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      {/* ✅ Mobile view: PO-like cards */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="glass-card rounded-xl p-4 text-sm text-muted-foreground">Loading invoices...</div>
        ) : filtered.length === 0 ? (
          <div className="glass-card rounded-xl p-4 text-sm text-muted-foreground">No invoices found.</div>
        ) : (
          filtered.map((inv, i) => {
            const st = statusMap[inv.invoice_status] || statusMap.Pending;
            const StatusIcon = st.icon;

            return (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass-card rounded-xl overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">
                        <span className="font-mono text-xs">{inv.invoice_number || "—"}</span>
                        <span className="text-muted-foreground font-normal"> — {inv?.supplier?.name || "—"}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        PO: {inv.po_number || "—"} • {formatDate(inv.invoice_date)} • Total: {money(inv.invoice_total)}
                      </p>
                    </div>

                    <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1", st.style)}>
                      <StatusIcon size={12} />
                      {st.label}
                    </span>
                  </div>

                  <div className="flex justify-end gap-3 mt-4">
                    <button
                      onClick={() => openDetails(inv.id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                    >
                      <Eye size={14} />
                      View Full Details
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* ✅ Desktop view: table */}
      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                <th className="px-5 py-3 font-medium">Invoice</th>
                <th className="px-5 py-3 font-medium">PO Ref</th>
                <th className="px-5 py-3 font-medium">Supplier</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-5 py-10 text-center text-sm text-muted-foreground" colSpan={7}>
                    Loading invoices...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-sm text-muted-foreground" colSpan={7}>
                    No invoices found.
                  </td>
                </tr>
              ) : (
                filtered.map((inv, i) => {
                  const st = statusMap[inv.invoice_status] || statusMap.Pending;
                  const StatusIcon = st.icon;

                  return (
                    <motion.tr
                      key={inv.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-mono text-xs font-medium">{inv.invoice_number || "—"}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{inv.po_number || "—"}</td>
                      <td className="px-5 py-3.5">{inv?.supplier?.name || "—"}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{formatDate(inv.invoice_date)}</td>
                      <td className="px-5 py-3.5 font-semibold">{money(inv.invoice_total)}</td>
                      <td className="px-5 py-3.5">
                        <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1", st.style)}>
                          <StatusIcon size={12} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => openDetails(inv.id)}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                        >
                          <Eye size={14} />
                          View Full Details
                        </button>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Dialog */}
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-5xl max-h-[85vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Purchase Invoice Details</DialogTitle>
    </DialogHeader>

    {detailLoading ? (
      <div className="py-10 text-center text-sm text-muted-foreground">Loading details...</div>
    ) : selectedError ? (
      <div className="py-2 text-sm text-destructive">{selectedError}</div>
    ) : !selected ? (
      <div className="py-2 text-sm text-muted-foreground">No data.</div>
    ) : (
      <div className="space-y-6">
        {/* Header */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4">
            <div className="text-sm text-muted-foreground">Invoice Number</div>
            <div className="font-semibold">{selected.invoice_number || "—"}</div>

            <div className="mt-3 text-sm text-muted-foreground">Invoice Date</div>
            <div className="font-medium">{formatDate(selected.invoice_date)}</div>

            <div className="mt-3 text-sm text-muted-foreground">PO Number</div>
            <div className="font-medium">{selected.po_number || "—"}</div>

            <div className="mt-3 text-sm text-muted-foreground">Status</div>
            <div className="font-medium">{selected.invoice_status || "—"}</div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm text-muted-foreground">Supplier</div>
            <div className="font-semibold">{selected?.supplier?.name || "—"}</div>
            <div className="text-sm break-words">{selected?.supplier?.address || "—"}</div>

            <div className="mt-3 text-sm text-muted-foreground">Contact</div>
            <div className="text-sm break-words">
              {(selected?.supplier?.contact?.person || "—")} •{" "}
              {(selected?.supplier?.contact?.email || "—")} •{" "}
              {(selected?.supplier?.contact?.phone || "—")}
            </div>

            <div className="mt-3 text-sm text-muted-foreground">Warehouse</div>
            <div className="text-sm break-words">
              {(selected?.warehouse?.name || "—")} • {(selected?.warehouse?.location || "—")}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="rounded-2xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                  <th className="px-5 py-3 font-medium">SKU</th>
                  <th className="px-5 py-3 font-medium">Item Description</th>
                  <th className="px-5 py-3 font-medium text-right">Quantity</th>
                  <th className="px-5 py-3 font-medium text-right">Unit Price</th>
                  <th className="px-5 py-3 font-medium">Batch Number</th>
                  <th className="px-5 py-3 font-medium">Expiry Date</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(selected.line_items || []).map((li, idx) => (
                  <tr key={`${li.sku || "sku"}-${idx}`} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-3.5 font-mono text-xs font-medium">{li.sku || "—"}</td>
                    <td className="px-5 py-3.5">{li.item_description || "—"}</td>
                    <td className="px-5 py-3.5 text-right">{li.quantity ?? "—"}</td>
                    <td className="px-5 py-3.5 text-right">{money(li.unit_price)}</td>
                    <td className="px-5 py-3.5">{li.batch_number || "—"}</td>
                    <td className="px-5 py-3.5">{formatDate(li.expiry_date)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold">{money(li.total)}</td>
                  </tr>
                ))}

                <tr className="bg-muted/20">
                  <td className="px-5 py-3.5 font-semibold text-right" colSpan={6}>
                    Invoice Total
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold">
                    {money(selected.invoice_total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Sticky Close */}
        <div className="sticky bottom-0 -mx-6 bg-background/95 backdrop-blur border-t border-border px-6 py-3 flex justify-end">
          <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    )}
  </DialogContent>
</Dialog>

    </div>
  );
}
