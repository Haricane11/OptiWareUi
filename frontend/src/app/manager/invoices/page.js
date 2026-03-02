"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Search, CheckCircle2, Clock, XCircle, Receipt, Eye, Trash2, PackageCheck, Truck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const statusMap = {
  Received: { label: "Received", style: "bg-success/10 text-success", icon: CheckCircle2 },
  Pending: { label: "Pending", style: "bg-warning/10 text-warning", icon: Clock },
  Disputed: { label: "Disputed", style: "bg-destructive/10 text-destructive", icon: XCircle },
  Partial: { label: "Partial", style: "bg-blue-500/10 text-blue-600", icon: AlertTriangle },
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

  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const invoicesRef = useRef(invoices); // Create a ref for invoices

  useEffect(() => {
    invoicesRef.current = invoices; // Keep the ref updated
  }, [invoices]);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    if (!search) return invoices;
    return invoices.filter(
      (inv) =>
        inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
        inv.po_number?.toLowerCase().includes(search.toLowerCase()) ||
        inv.supplier?.name?.toLowerCase().includes(search.toLowerCase())
    );
  }, [invoices, search]);

  const [open, setOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedError, setSelectedError] = useState("");

  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [scannedItems, setScannedItems] = useState([]);
  const [scannedItemsLoading, setScannedItemsLoading] = useState(true);
  const [scannedItemsError, setScannedItemsError] = useState("");

  const fetchScannedItems = useCallback(async () => {
    setScannedItemsLoading(true);
    setScannedItemsError("");
    try {
      const res = await fetch(`${API_BASE}/scanned-items`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load scanned items (${res.status})`);
      const data = await res.json();
      // Ensure IDs are unique for React keys, fallback to randomUUID if missing
      const formattedData = data.map(item => {
        const itemId = item.id && item.id.trim() !== '' ? item.id : crypto.randomUUID();
        if (item.id === null || item.id === undefined || item.id.trim() === '') {
          console.warn(`Item received with invalid ID: ${item.id}. Generated fallback ID: ${itemId}`);
        }
        return {
          id: itemId,
          sku: item.sku,
          quantity: item.quantity,
          po_ref: item.po_ref,
          invoice_number: item.invoice_number,
          supplier_name: item.supplier_name,
          timestamp: item.timestamp,
          invoice_line_items: item.invoice_line_items,
          status: item.status || null,
        };
      });
      setScannedItems(formattedData);
    } catch (e) {
      setScannedItemsError(e?.message || "Failed to load scanned items");
    } finally {
      setScannedItemsLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchase-invoices`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load invoices (${res.status})`);
      const data = await res.json();
      setInvoices(data);
    } catch (e) {
      setError(e?.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchScannedItems();
  }, [fetchInvoices, fetchScannedItems]);

  const openDetails = useCallback(async (id) => {
    setDetailLoading(true);
    setSelectedError("");
    setOpen(true); // Open the dialog immediately
    try {
      const res = await fetch(`${API_BASE}/purchase-invoices/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load invoice details (${res.status})`);
      const data = await res.json();
      setSelected(data);
    } catch (e) {
      setSelectedError(e?.message || "Failed to load invoice details");
      setSelected(null); // Clear selected if error
    } finally {
      setDetailLoading(false);
    }
  }, []); // No dependencies needed for openDetails itself, as it uses state setters and API_BASE which are stable.

  const handleDeleteInvoice = useCallback(async () => {
    if (!invoiceToDelete) return;

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/purchase-invoices/${invoiceToDelete.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || `Failed to delete invoice (${res.status})`);
      }

      toast({
        title: "Invoice Deleted",
        description: `Invoice ${invoiceToDelete.invoice_number} has been successfully deleted.`,
      });

      setOpenDeleteDialog(false);
      setInvoiceToDelete(null);
      setSelected(null); // Close details view if open for the deleted invoice
      fetchInvoices(); // Refresh the list of invoices
    } catch (e) {
      toast({
        title: "Error Deleting Invoice",
        description: e?.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }, [invoiceToDelete, fetchInvoices, toast]);

  const getLineItemMatchStatus = useCallback((invoiceLineItem, invoicePoNumber) => {
    if (!invoicePoNumber) return "no_po_ref";

    const matchingScans = scannedItems.filter(
      (scan) => scan.po_ref === invoicePoNumber && scan.sku === invoiceLineItem.sku
    );

    if (matchingScans.length === 0) return "no_sku_match";

    const scannedPacks = matchingScans.length;
    const linePacks = Number(invoiceLineItem.pack || 1);
    const hasPartialScanStatus = matchingScans.some(scan => scan.status === "Partial");

    if (scannedPacks > linePacks) {
      return "disputed"; // Over-received by packs
    } else if (scannedPacks === linePacks) {
      return "fully_matched"; // All packs scanned
    } else {
      if (hasPartialScanStatus) {
        return "partial";
      } else {
        return "disputed"; // Under-received (no explicit partial)
      }
    }
  }, [scannedItems]);

  const checkIfInvoiceIsFullyReceived = useCallback((invoice) => {
    if (!invoice || !invoice.line_items || invoice.line_items.length === 0) {
      return false;
    }
    return invoice.line_items.every(li => getLineItemMatchStatus(li, invoice.po_number) === "fully_matched");
  }, [getLineItemMatchStatus]);

  const checkIfInvoiceHasDisputedItems = useCallback((invoice) => {
    if (!invoice || !invoice.line_items || invoice.line_items.length === 0) {
      return false;
    }
    return invoice.line_items.some(li => getLineItemMatchStatus(li, invoice.po_number) === "disputed");
  }, [getLineItemMatchStatus]);

  const checkIfInvoiceHasPartialItems = useCallback((invoice) => {
    if (!invoice || !invoice.line_items || invoice.line_items.length === 0) {
      return false;
    }
    return invoice.line_items.some(li => getLineItemMatchStatus(li, invoice.po_number) === "partial");
  }, [getLineItemMatchStatus]);

  const summary = useMemo(() => {
    const counts = { Received: 0, Pending: 0 };
    filtered.forEach((invoice) => {
      if (checkIfInvoiceIsFullyReceived(invoice)) {
        counts.Received++;
      } else {
        counts.Pending++;
      }
    });
    return counts;
  }, [filtered, checkIfInvoiceIsFullyReceived]);

  const isInvoiceFullyReceived = useMemo(() => {
    if (!selected || !selected.line_items || selected.line_items.length === 0) {
      return false;
    }
    return selected.line_items.every(li => getLineItemMatchStatus(li, selected.po_number) === "fully_matched");
  }, [selected, scannedItems, getLineItemMatchStatus]);

  useEffect(() => {
    if (selected && selected.po_number) {
      const newStatus = isInvoiceFullyReceived ? "Received" : "Pending";
      if (newStatus !== selected.invoice_status) {
        const updateInvoiceStatus = async () => {
          try {
            const res = await fetch(`${API_BASE}/purchase-invoices/by-po-number/${selected.po_number}/status`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.detail || `Failed to update invoice status (${res.status})`);
            }
            setSelected((prev) => (prev ? { ...prev, invoice_status: newStatus } : null));
          } catch (e) {
            toast({
              title: "Error Updating Invoice Status",
              description: e?.message || "An unexpected error occurred.",
              variant: "destructive",
            });
          }
        };
        updateInvoiceStatus();
      }
    }
  }, [isInvoiceFullyReceived, selected, toast]);

  // New useEffect for automatic invoice status updates
  // Replace your existing "autoUpdateInvoices" useEffect with this version:

  useEffect(() => {
    const autoUpdateInvoices = async () => {
      for (const invoice of invoicesRef.current) {
        const newStatus = checkIfInvoiceIsFullyReceived(invoice) ? "Received" : "Pending";
        if (newStatus !== invoice.invoice_status) {
          try {
            const res = await fetch(`${API_BASE}/purchase-invoices/by-po-number/${invoice.po_number}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error(`Failed to update status for ${invoice.invoice_number}`);
            setInvoices((prevInvoices) =>
              prevInvoices.map((inv) =>
                inv.id === invoice.id ? { ...inv, invoice_status: newStatus } : inv
              )
            );
            setSelected((prevSelected) => {
              if (prevSelected && prevSelected.id === invoice.id) {
                return { ...prevSelected, invoice_status: newStatus };
              }
              return prevSelected;
            });
          } catch (e) {
            console.error("Auto-update error:", e);
            toast({
              title: "Auto-update Failed",
              description: e.message,
              variant: "destructive",
            });
          }
        }
      }
    };
    if (!loading && !scannedItemsLoading && invoicesRef.current.length > 0) {
      autoUpdateInvoices();
    }
  }, [
    scannedItems,
    checkIfInvoiceIsFullyReceived,
    loading,
    scannedItemsLoading,
    toast
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Purchase Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verify incoming invoices against purchase orders.
        </p>
      </div>

      {/* Summary (responsive) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
        {[
          { label: "Received", count: summary.Received, color: "text-success bg-success/10" },
          { label: "Pending", count: summary.Pending, color: "text-warning bg-warning/10" },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className={cn("p-2 sm:p-2.5 rounded-xl shrink-0", s.color)}>
              <Receipt size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground leading-tight break-words">
                {s.label}
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

        <Button variant="outline" className="rounded-xl w-fit" onClick={() => { fetchInvoices(); fetchScannedItems(); }} disabled={loading}>
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
                      View
                    </button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => {
                        setInvoiceToDelete(inv);
                        setOpenDeleteDialog(true);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>

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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openDetails(inv.id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                          >
                            <Eye size={14} />
                            View
                          </button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="rounded-lg"
                            onClick={() => {
                              setInvoiceToDelete(inv);
                              setOpenDeleteDialog(true);
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>

                        </div>
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
                        <th className="px-5 py-3 font-medium" style={{ width: "12ch", minWidth: "10ch" }}>SKU</th>
                        <th className="px-5 py-3 font-medium">Item Description</th>
                        <th className="px-5 py-3 font-medium text-center" style={{ width: "6ch", minWidth: "6ch" }}>Pack</th>
                        <th className="px-5 py-3 font-medium text-right" style={{ width: "10ch", minWidth: "8ch" }}>Quantity</th>
                        <th className="px-5 py-3 font-medium text-right" style={{ width: "10ch", minWidth: "8ch" }}>Unit Price</th>
                        {(selected.total_gross_weight_kg || selected.line_items?.some(li => li.total_weight_kg)) && (
                          <th className="px-5 py-3 font-medium text-right" style={{ width: "10ch", minWidth: "8ch" }}>Weight (kg)</th>
                        )}
                        <th className="px-5 py-3 font-medium" style={{ width: "12ch", minWidth: "10ch" }}>Expiry Date</th>
                        <th className="px-5 py-3 font-medium text-right" style={{ width: "10ch", minWidth: "9ch" }}>Total</th>
                        <th className="px-5 py-3 font-medium" style={{ width: "10ch", minWidth: "9ch" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.line_items || []).map((li, idx) => {
                        const matchStatus = getLineItemMatchStatus(li, selected.po_number);
                        const isFullyMatched = matchStatus === "fully_matched";

                        // Calculate remaining packs for the current line item
                        const matchingScansForLineItem = scannedItems.filter(
                          (scan) => scan.po_ref === selected.po_number && scan.sku === li.sku
                        );
                        const scannedPacks = matchingScansForLineItem.length;
                        const totalPacks = Number(li.pack || 1);
                        const remainingPacks = Math.max(0, totalPacks - scannedPacks);
                        return (
                          <tr
                            key={`${li.sku || "sku"}-${idx}`}
                            className={`border-b border-border/50 last:border-0 ${isFullyMatched ? "border-l-4 border-green-500" : ""
                              }`}
                          >
                            <td className="px-5 py-3.5 font-mono text-xs font-medium" style={{ width: "12ch", minWidth: "10ch" }}>{li.sku || "—"}</td>
                            <td className="px-5 py-3.5">{li.item_description || "—"}</td>
                            <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: "6ch", minWidth: "6ch" }}>
                              <span className="text-emerald-600 font-semibold">{scannedPacks}</span>
                              <span className="opacity-60">/{totalPacks}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap" style={{ width: "10ch", minWidth: "8ch" }}>
                              <div className="flex flex-col items-end">
                                {/* Main Quantity */}
                                <span>{li.quantity}</span>

                                {/* Remaining Badge - Now on a new line */}
                                {/* {(matchStatus === "partial" || matchStatus === "disputed") && remainingPacks > 0 && (
                                  <span className="mt-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                    Remain: {remainingPacks} pk
                                  </span>
                                )} */}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right" style={{ width: "10ch", minWidth: "8ch" }}>{money(li.unit_price)}</td>
                            {(selected.total_gross_weight_kg || selected.line_items?.some(l => l.total_weight_kg)) && (
                              <td className="px-5 py-3.5 font-medium text-primary text-right" style={{ width: "10ch", minWidth: "8ch" }}>
                                {li.total_weight_kg || "—"}
                              </td>
                            )}
                            <td className="px-5 py-3.5" style={{ width: "12ch", minWidth: "10ch" }}>{formatDate(li.expiry_date)}</td>
                            <td className="px-5 py-3.5 text-right font-semibold" style={{ width: "10ch", minWidth: "9ch" }}>{money(li.total)}</td>
                            <td className="px-5 py-3.5" style={{ width: "10ch", minWidth: "9ch" }}>
                              {(() => {
                                const displayStatusKey = matchStatus === "fully_matched" ? "Received" : "Pending";
                                const st = statusMap[displayStatusKey];
                                return (
                                  <span className={cn("font-medium text-xs", st.style)}>
                                    {st.label}
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}

                      <tr className="bg-muted/20">
                        <td className="px-5 py-3.5 font-semibold text-right" colSpan={(selected.total_gross_weight_kg || selected.line_items?.some(li => li.total_weight_kg)) ? 7 : 6}>
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
      {/* Delete Confirmation Dialog */}
      <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete invoice{" "}
              <span className="font-semibold">{invoiceToDelete?.invoice_number}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteInvoice} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
