"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Search, CheckCircle2, Clock, XCircle, Receipt, Eye, Trash2, PackageCheck, Truck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

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
  Allocated: { label: "Allocated", style: "bg-indigo-500/10 text-indigo-600", icon: Clock },
  Picked: { label: "Picked", style: "bg-blue-500/10 text-blue-600", icon: PackageCheck },
  Disputed: { label: "Disputed", style: "bg-destructive/10 text-destructive", icon: XCircle },
  Partial: { label: "Partial", style: "bg-blue-500/10 text-blue-600", icon: AlertTriangle },
  Shipped: { label: "Shipped", style: "bg-emerald-500/10 text-emerald-600", icon: Truck },
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
  const { user } = useAuth();
  const isOutbound = user?.team === "Outbound";
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
      (inv) => {
        const primaryNum = isOutbound ? inv.delivery_number : inv.invoice_number;
        const secondaryNum = isOutbound ? inv.order_number : inv.po_number;
        const entityName = isOutbound ? inv.customer_name : inv.supplier?.name;
        
        return (
          primaryNum?.toLowerCase().includes(search.toLowerCase()) ||
          secondaryNum?.toLowerCase().includes(search.toLowerCase()) ||
          entityName?.toLowerCase().includes(search.toLowerCase())
        );
      }
    );
  }, [invoices, search, isOutbound]);

  const [open, setOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedError, setSelectedError] = useState("");

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
      const endpoint = isOutbound ? "delivery-notes" : "purchase-invoices";
      const res = await fetch(`${API_BASE}/${endpoint}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load ${isOutbound ? "delivery notes" : "invoices"} (${res.status})`);
      const data = await res.json();
      setInvoices(data);
    } catch (e) {
      setError(e?.message || `Failed to load ${isOutbound ? "delivery notes" : "invoices"}`);
    } finally {
      setLoading(false);
    }
  }, [isOutbound]);

  useEffect(() => {
    fetchInvoices();
    fetchScannedItems();
  }, [fetchInvoices, fetchScannedItems]);

  const openDetails = useCallback(async (id) => {
    setDetailLoading(true);
    setSelectedError("");
    setOpen(true); // Open the dialog immediately
    try {
      const endpoint = isOutbound ? "delivery-notes" : "purchase-invoices";
      const res = await fetch(`${API_BASE}/${endpoint}/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load details (${res.status})`);
      const data = await res.json();
      setSelected(data);
    } catch (e) {
      setSelectedError(e?.message || "Failed to load details");
      setSelected(null); // Clear selected if error
    } finally {
      setDetailLoading(false);
    }
  }, [isOutbound]);

  const handleMarkShipped = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/delivery-notes/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "shipped" }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast({ title: "Success", description: "Delivery note marked as shipped" });
      fetchInvoices();
    } catch (error) {
      toast({ title: "Error", description: "Could not update status", variant: "destructive" });
    }
  };

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
      return "disputed";
    } else if (scannedPacks === linePacks) {
      return "fully_matched";
    } else {
      if (hasPartialScanStatus) {
        return "partial";
      } else {
        return "disputed";
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
    filtered.forEach((inv) => {
      let statusKey = 'Pending';
      if (isOutbound) {
        if (inv.status === 'shipped') statusKey = 'Shipped';
        else if (inv.status === 'picked') statusKey = 'Picked';
        else statusKey = 'Pending';
      } else {
        if (checkIfInvoiceIsFullyReceived(inv)) statusKey = 'Received';
        else statusKey = 'Pending';
      }
      
      if (statusKey === 'Received' || statusKey === 'Shipped' || statusKey === 'Picked') {
        counts.Received++;
      } else {
        counts.Pending++;
      }
    });
    return counts;
  }, [filtered, checkIfInvoiceIsFullyReceived, isOutbound]);

  const isInvoiceFullyReceived = useMemo(() => {
    if (!selected || !selected.line_items || selected.line_items.length === 0) {
      return false;
    }
    return selected.line_items.every(li => getLineItemMatchStatus(li, selected.po_number) === "fully_matched");
  }, [selected, scannedItems, getLineItemMatchStatus]);

  useEffect(() => {
    if (isOutbound) return; // Status update logic only for Inbound invoices
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

            // Update the selected invoice's status locally to reflect the change without re-fetching
            setSelected((prev) => (prev ? { ...prev, invoice_status: newStatus } : null));
            // Also re-fetch all invoices to update the main list
            // REMOVED: This was causing an infinite loop by triggering re-fetches that fed back into the useEffect's dependencies.
            // await fetchInvoices();
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
  }, [isInvoiceFullyReceived, selected, openDetails, fetchInvoices, toast]);

  // New useEffect for automatic invoice status updates
  // Replace your existing "autoUpdateInvoices" useEffect with this version:

  useEffect(() => {
    if (isOutbound) return; // Auto-update logic only for Inbound invoices
    const autoUpdateInvoices = async () => {
      // Iterate through the current invoices from the ref
      for (const invoice of invoicesRef.current) {
        const newStatus = checkIfInvoiceIsFullyReceived(invoice) ? "Received" : "Pending";

        // Only proceed if the calculated status differs from the one stored in the backend
        if (newStatus !== invoice.invoice_status) {
          try {
            const res = await fetch(`${API_BASE}/purchase-invoices/by-po-number/${invoice.po_number}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: newStatus }),
            });

            if (!res.ok) throw new Error(`Failed to update status for ${invoice.invoice_number}`);

            // Update local state so the UI updates immediately
            setInvoices((prevInvoices) =>
              prevInvoices.map((inv) =>
                inv.id === invoice.id ? { ...inv, invoice_status: newStatus } : inv
              )
            );

            // Update "selected" if the user has this specific invoice details dialog open
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

    // Run the check whenever scannedItems change or invoices finish loading
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
        <h1 className="text-2xl font-bold tracking-tight">
          {isOutbound ? "Delivery Notes" : "Purchase Invoices"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isOutbound 
            ? "Verify outgoing delivery notes against customer orders."
            : "Verify incoming invoices against purchase orders."}
        </p>
      </div>

      {/* Summary (responsive) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
        {[
          { label: isOutbound ? "Shipped" : "Received", count: summary.Received, color: "text-success bg-success/10" },
          { label: isOutbound ? "Pending" : "Pending", count: summary.Pending, color: "text-warning bg-warning/10" },
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
            let statusKey = 'Pending';
            if (isOutbound) {
              if (inv.status === 'shipped') statusKey = 'Shipped';
              else if (inv.status === 'picked') statusKey = 'Picked';
              else statusKey = 'Pending';
            } else {
              statusKey = inv.invoice_status || 'Pending';
            }
            const st = statusMap[statusKey] || statusMap.Pending;
            const StatusIcon = st.icon;

            const primaryNum = isOutbound ? inv.delivery_number : inv.invoice_number;
            const secondaryNum = isOutbound ? inv.order_number : inv.po_number;
            const entityName = isOutbound ? inv.customer_name : inv.supplier?.name;

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
                        <span className="font-mono text-xs">{primaryNum || "—"}</span>
                        <span className="text-muted-foreground font-normal"> — {entityName || "—"}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isOutbound ? "Order" : "PO"}: {secondaryNum || "—"} • {formatDate(isOutbound ? inv.created_at : inv.invoice_date)} {!isOutbound && `• Total: ${money(inv.invoice_total)}`}
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
                    {isOutbound && inv.status === 'picked' && (
                      <button
                        onClick={() => handleMarkShipped(inv.id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 transition-colors inline-flex items-center gap-2"
                      >
                        <Truck size={14} />
                        Ship
                      </button>
                    )}

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
                <th className="px-5 py-3 font-medium">
                  {isOutbound ? "Delivery Note" : "Invoice"}
                </th>
                <th className="px-5 py-3 font-medium">
                  {isOutbound ? "SO Ref" : "PO Ref"}
                </th>
                <th className="px-5 py-3 font-medium">{isOutbound ? "Customer" : "Supplier"}</th>
                <th className="px-5 py-3 font-medium">{isOutbound ? "Created" : "Date"}</th>
                <th className="px-5 py-3 font-medium">{isOutbound ? "Items" : "Amount"}</th>
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
                  let statusKey = 'Pending';
                  if (isOutbound) {
                    if (inv.status === 'shipped') statusKey = 'Shipped';
                    else if (inv.status === 'picked') statusKey = 'Picked';
                    else if (inv.status === 'allocated') statusKey = 'Allocated';
                    else statusKey = 'Pending';
                  } else {
                    statusKey = inv.invoice_status || 'Pending';
                  }
                  const st = statusMap[statusKey] || statusMap.Pending;
                  const StatusIcon = st.icon;

                  return (
                        <motion.tr
                          key={inv.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.04 }}
                          className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-5 py-3.5 font-mono text-xs font-medium">{isOutbound ? inv.delivery_number : inv.invoice_number || "—"}</td>
                          <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{isOutbound ? inv.order_number : inv.po_number || "—"}</td>
                          <td className="px-5 py-3.5">{isOutbound ? inv.customer_name : inv?.supplier?.name || "—"}</td>
                          <td className="px-5 py-3.5 text-muted-foreground">{formatDate(isOutbound ? inv.created_at : inv.invoice_date)}</td>
                          <td className="px-5 py-3.5 font-semibold">{isOutbound ? `${inv.item_count} items` : money(inv.invoice_total)}</td>
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
                              {isOutbound && inv.status === 'picked' && (
                                <button
                                  onClick={() => handleMarkShipped(inv.id)}
                                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 transition-colors inline-flex items-center gap-2"
                                >
                                  <Truck size={14} />
                                  Ship
                                </button>
                              )}

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
            <DialogTitle>
              {isOutbound ? "Delivery Note Details" : "Purchase Invoice Details"}
            </DialogTitle>
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
                  <div className="text-sm text-muted-foreground">{isOutbound ? "Delivery Number" : "Invoice Number"}</div>
                  <div className="font-semibold">{(isOutbound ? selected.delivery_number : selected.invoice_number) || "—"}</div>

                  <div className="mt-3 text-sm text-muted-foreground">{isOutbound ? "Created At" : "Invoice Date"}</div>
                  <div className="font-medium">{formatDate(isOutbound ? selected.created_at : selected.invoice_date)}</div>

                  <div className="mt-3 text-sm text-muted-foreground">{isOutbound ? "Order Number" : "PO Number"}</div>
                  <div className="font-medium">{(isOutbound ? selected.order_number : selected.po_number) || "—"}</div>

                  <div className="mt-3 text-sm text-muted-foreground">Status</div>
                  <div className="font-medium">{(isOutbound ? selected.status : selected.invoice_status) || "—"}</div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="text-sm text-muted-foreground">{isOutbound ? "Customer" : "Supplier"}</div>
                  <div className="font-semibold">{(isOutbound ? selected.customer_name : selected?.supplier?.name) || "—"}</div>
                  {!isOutbound && <div className="text-sm break-words">{selected?.supplier?.address || "—"}</div>}

                  {isOutbound ? (
                    <>
                      <div className="mt-3 text-sm text-muted-foreground">Warehouse</div>
                      <div className="text-sm font-medium">{selected.warehouse_name || "—"}</div>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </div>

              {/* Line Items */}
              <div className="rounded-2xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                        <th className="px-5 py-3 font-medium" style={{ width: "12ch", minWidth: "10ch" }}>SKU</th>
                        <th className="px-5 py-3 font-medium">{isOutbound ? "Product Name" : "Item Description"}</th>
                        <th className="px-5 py-3 font-medium text-center" style={{ width: "6ch", minWidth: "6ch" }}>{isOutbound ? "—" : "Pack"}</th>
                        <th className="px-5 py-3 font-medium text-right" style={{ width: "10ch", minWidth: "8ch" }}>{isOutbound ? "Shipped Qty" : "Quantity"}</th>
                        <th className="px-5 py-3 font-medium text-right" style={{ width: "10ch", minWidth: "8ch" }}>{isOutbound ? "—" : "Unit Price"}</th>
                        {(selected.total_gross_weight_kg || selected.line_items?.some(li => li.total_weight_kg)) && (
                          <th className="px-5 py-3 font-medium text-right" style={{ width: "10ch", minWidth: "8ch" }}>Weight (kg)</th>
                        )}
                        <th className="px-5 py-3 font-medium" style={{ width: "12ch", minWidth: "10ch" }}>{isOutbound ? "—" : "Expiry Date"}</th>
                        <th className="px-5 py-3 font-medium text-right" style={{ width: "10ch", minWidth: "9ch" }}>{isOutbound ? "—" : "Total"}</th>
                        <th className="px-5 py-3 font-medium" style={{ width: "10ch", minWidth: "9ch" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(isOutbound ? selected.items : (selected.line_items || [])).map((item, idx) => {
                        if (isOutbound) {
                          return (
                            <tr key={`${item.sku || "sku"}-${idx}`} className="border-b border-border/50 last:border-0">
                              <td className="px-5 py-3.5 font-mono text-xs font-medium" style={{ width: "12ch", minWidth: "10ch" }}>{item.sku || "—"}</td>
                              <td className="px-5 py-3.5">{item.product_name || "—"}</td>
                              <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: "6ch", minWidth: "6ch" }}>—</td>
                              <td className="px-4 py-3 whitespace-nowrap text-right" style={{ width: "10ch", minWidth: "8ch" }}>
                                <div className="flex flex-col items-end">
                                  <span className="font-semibold text-primary">{item.shipped_qty}</span>
                                  <span className="text-[10px] text-muted-foreground">ordered: {item.ordered_qty}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-right" style={{ width: "10ch", minWidth: "8ch" }}>—</td>
                              <td className="px-5 py-3.5" style={{ width: "12ch", minWidth: "10ch" }}>—</td>
                              <td className="px-5 py-3.5 text-right font-semibold" style={{ width: "10ch", minWidth: "9ch" }}>—</td>
                              <td className="px-5 py-3.5" style={{ width: "10ch", minWidth: "9ch" }}>
                                <span className={cn(
                                  "font-medium text-xs px-2 py-1 rounded-full",
                                  selected.status === 'shipped' ? "bg-emerald-500/10 text-emerald-600" : 
                                  selected.status === 'picked' ? "bg-blue-500/10 text-blue-600" : 
                                  "bg-warning/10 text-warning"
                                )}>
                                  {selected.status === 'shipped' ? 'Shipped' : 
                                   selected.status === 'picked' ? 'Picked' : 'Pending'}
                                </span>
                              </td>
                            </tr>
                          );
                        }

                        // Original Invoice Mapping
                        const li = item;
                        const matchStatus = getLineItemMatchStatus(li, selected.po_number);
                        const isFullyMatched = matchStatus === "fully_matched";

                        const matchingScansForLineItem = scannedItems.filter(
                          (scan) => scan.po_ref === selected.po_number && scan.sku === li.sku
                        );
                        const scannedPacks = matchingScansForLineItem.length;
                        const totalPacks = Number(li.pack || 1);
                        
                        return (
                          <tr
                            key={`${li.sku || "sku"}-${idx}`}
                            className={`border-b border-border/50 last:border-0 ${isFullyMatched ? "border-l-4 border-green-500" : ""}`}
                          >
                            <td className="px-5 py-3.5 font-mono text-xs font-medium" style={{ width: "12ch", minWidth: "10ch" }}>{li.sku || "—"}</td>
                            <td className="px-5 py-3.5">{li.item_description || "—"}</td>
                            <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: "6ch", minWidth: "6ch" }}>
                              <span className="text-emerald-600 font-semibold">{scannedPacks}</span>
                              <span className="opacity-60">/{totalPacks}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap" style={{ width: "10ch", minWidth: "8ch" }}>
                              <div className="flex flex-col items-end">
                                <span>{li.quantity}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right" style={{ width: "10ch", minWidth: "8ch" }}>{money(li.unit_price)}</td>
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

                      {!isOutbound && (
                        <tr className="bg-muted/20">
                          <td className="px-5 py-3.5 font-semibold text-right" colSpan={(selected.total_gross_weight_kg || selected.line_items?.some(li => li.total_weight_kg)) ? 7 : 6}>
                            {isOutbound ? "Total Amount" : "Invoice Total"}
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold">
                            {money(selected.invoice_total)}
                          </td>
                        </tr>
                      )}
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
