"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Eye, FileText, X, Trash2, Download, Printer, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, deletePurchaseOrder, updatePurchaseOrder, generatePurchaseInvoice } from "@/lib/api/purchase-orders";
import { getSuppliers, getWarehouses, getProducts } from "@/lib/api/products"; // Assuming these are needed for new order form
import html2pdf from "html2pdf.js";

const statusMap = {
  pending: { label: "Pending", style: "bg-warning/10 text-warning" },
  in_transit: { label: "In Transit", style: "bg-primary/10 text-primary" },
  delivered: { label: "Delivered", style: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", style: "bg-destructive/10 text-destructive" },
  deleted: { label: "Deleted", style: "bg-destructive/20 text-destructive grayscale" },
};// Renders print content into <body> so print CSS can safely hide the app without hiding the PDF content.
function PrintPortal({ children }) {
  const [el, setEl] = useState(null);

  useEffect(() => {
    // Reuse if already exists (hot reload / repeated opens)
    let node = document.getElementById("print-root");
    if (!node) {
      node = document.createElement("div");
      node.id = "print-root";
      document.body.appendChild(node);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEl(node);

    return () => {
      // Keep the node to avoid flicker between prints; clear content by unmounting children.
      // If you prefer removing it, uncomment:
      // node?.remove();
    };
  }, []);

  if (!el) return null;
  return createPortal(children, el);
}

function apiBase() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

function normalizeStatus(dbStatus) {
  const s = String(dbStatus || "").toLowerCase();
  if (["in_transit", "in-transit", "shipping", "shipped"].includes(s)) return "in_transit";
  if (["delivered", "received", "completed"].includes(s)) return "delivered";
  if (["cancelled", "canceled", "void"].includes(s)) return "cancelled";
  if (["draft", "created", "confirmed", "approved", "pending"].includes(s)) return "pending";
  return "pending";
}

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(n) {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) msg = typeof data.detail === "string" ? data.detail : msg;
    } catch { }
    throw new Error(msg);
  }
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) msg = typeof data.detail === "string" ? data.detail : msg;
    } catch { }
    throw new Error(msg);
  }
  return res.json();
}

function StatCard({ label, value, isPdf }) {
  if (isPdf) {
    return (
      <div style={{ borderRadius: "1rem", border: "1px solid #e5e7eb", backgroundColor: "#ffffff", padding: "0.75rem 1rem", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" }}>
        <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.025em", color: "#6b7280" }}>{label}</div>
        <div style={{ marginTop: "0.25rem", fontSize: "1rem", lineHeight: "1.5rem", fontWeight: "600", color: "#111827" }}>{value}</div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}

function StatusChip({ status, isPdf }) {
  const key = normalizeStatus(status);
  const st = statusMap[key] || statusMap.pending;

  if (isPdf) {
    // Hardcode colors for PDF to avoid CSS var issues
    let bg = "#fefce8"; let txt = "#a16207"; // pending (yellow)
    if (key === "in_transit") { bg = "#eff6ff"; txt = "#1d4ed8"; } // blue
    if (key === "delivered") { bg = "#f0fdf4"; txt = "#15803d"; } // green
    if (key === "cancelled") { bg = "#fef2f2"; txt = "#b91c1c"; } // red

    return (
      <span style={{
        fontSize: "0.75rem",
        padding: "0.25rem 0.625rem",
        borderRadius: "9999px",
        fontWeight: "500",
        backgroundColor: bg,
        color: txt
      }}>
        {st.label}
      </span>
    );
  }

  return <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", st.style)}>{st.label}</span>;
}

function DetailSheet({ detail, isPdf }) {
  const contactName =
    detail?.supplier_contact_person ||
    detail?.contact_person ||
    detail?.contact_name ||
    detail?.supplier_contact_name ||
    "—";

  if (isPdf) {
    return (
      <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.75rem" }}>
          <StatCard label="PO Date" value={detail?.created_at_fmt || "—"} isPdf={true} />
          <StatCard label="Expected Delivery" value={detail?.expected_date_fmt || "—"} isPdf={true} />
          <StatCard label="Order Value" value={detail?.total_amount_fmt || "—"} isPdf={true} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
          {/* Supplier */}
          <div style={{ borderRadius: "1rem", border: "1px solid #e5e7eb", backgroundColor: "#ffffff", padding: "1.25rem", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: "1rem", fontWeight: "600", color: "#111827" }}>Supplier Details</div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Vendor</div>
            </div>
            <div style={{ marginTop: "1rem", fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div>
                <span style={{ color: "#6b7280" }}>Supplier Name: </span>
                <span style={{ fontWeight: "600", color: "#111827" }}>{detail?.supplier_name || "—"}</span>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>Supplier Address: </span>
                <span style={{ color: "#111827" }}>{detail?.supplier_address || "—"}</span>
              </div>
              <div style={{ paddingTop: "0.5rem" }}>
                <div style={{ color: "#6b7280", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.025em" }}>Contact</div>
                <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <div>
                    <span style={{ color: "#6b7280" }}>Name: </span>
                    <span style={{ color: "#111827" }}>{contactName}</span>
                  </div>
                  <div>
                    <span style={{ color: "#6b7280" }}>Email: </span>
                    <span style={{ color: "#111827" }}>{detail?.supplier_email || "—"}</span>
                  </div>
                  <div>
                    <span style={{ color: "#6b7280" }}>Phone: </span>
                    <span style={{ color: "#111827" }}>{detail?.supplier_phone || "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Warehouse */}
          <div style={{ borderRadius: "1rem", border: "1px solid #e5e7eb", backgroundColor: "#ffffff", padding: "1.25rem", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: "1rem", fontWeight: "600", color: "#111827" }}>Warehouse Location</div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Destination</div>
            </div>
            <div style={{ marginTop: "1rem", fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div>
                <span style={{ color: "#6b7280" }}>Warehouse Name: </span>
                <span style={{ fontWeight: "600", color: "#111827" }}>{detail?.warehouse_name || "—"}</span>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>Warehouse ID: </span>
                <span style={{ color: "#111827" }}>{detail?.warehouse_id ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div style={{ borderRadius: "1rem", border: "1px solid #e5e7eb", backgroundColor: "#ffffff", overflow: "hidden", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "1rem", fontWeight: "600", color: "#111827" }}>Purchase Order Line Items</div>
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{detail?.items?.length || 0} items</div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "0.875rem", borderCollapse: "collapse" }}>
              <thead style={{ backgroundColor: "#f9fafb" }}>
                <tr style={{ textAlign: "left", fontSize: "0.75rem", color: "#6b7280" }}>
                  <th style={{ padding: "0.75rem 1.25rem", fontWeight: "500" }}>SKU</th>
                  <th style={{ padding: "0.75rem 1.25rem", fontWeight: "500" }}>Item</th>
                  <th style={{ padding: "0.75rem 1.25rem", fontWeight: "500" }}>Qty</th>
                  <th style={{ padding: "0.75rem 1.25rem", fontWeight: "500" }}>Unit Price</th>
                  <th style={{ padding: "0.75rem 1.25rem", fontWeight: "500", textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(detail?.items || []).map((it) => (
                  <tr key={it.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "0.75rem 1.25rem", color: "#6b7280" }}>{it.sku}</td>
                    <td style={{ padding: "0.75rem 1.25rem", color: "#111827" }}>{it.product_name}</td>
                    <td style={{ padding: "0.75rem 1.25rem", color: "#111827" }}>{it.qty}</td>
                    <td style={{ padding: "0.75rem 1.25rem", color: "#111827" }}>{it.unit_price_fmt}</td>
                    <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", color: "#111827" }}>{it.line_total_fmt}</td>
                  </tr>
                ))}

                {(!detail?.items || detail.items.length === 0) && (
                  <tr style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "1.5rem 1.25rem", textAlign: "center", color: "#6b7280" }} colSpan={5}>
                      No items found for this order.
                    </td>
                  </tr>
                )}

                <tr style={{ borderTop: "1px solid #e5e7eb", backgroundColor: "#f9fafb" }}>
                  <td style={{ padding: "0.75rem 1.25rem", fontWeight: "600", color: "#111827" }} colSpan={4}>
                    Grand Total
                  </td>
                  <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", fontWeight: "600", color: "#111827" }}>{detail?.total_amount_fmt || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="PO Date" value={detail?.created_at_fmt || "—"} />
        <StatCard label="Expected Delivery" value={detail?.expected_date_fmt || "—"} />
        <StatCard label="Order Value" value={detail?.total_amount_fmt || "—"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold">Supplier Details</div>
            <div className="text-xs text-muted-foreground">Vendor</div>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Supplier Name: </span>
              <span className="font-semibold">{detail?.supplier_name || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Supplier Address: </span>
              <span>{detail?.supplier_address || "—"}</span>
            </div>
            <div className="pt-2">
              <div className="text-muted-foreground text-xs uppercase tracking-wide">Contact</div>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="text-muted-foreground">Name: </span>
                  <span>{contactName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Email: </span>
                  <span>{detail?.supplier_email || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone: </span>
                  <span>{detail?.supplier_phone || "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold">Warehouse Location</div>
            <div className="text-xs text-muted-foreground">Destination</div>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Warehouse Name: </span>
              <span className="font-semibold">{detail?.warehouse_name || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Warehouse ID: </span>
              <span>{detail?.warehouse_id ?? "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="text-base font-semibold">Purchase Order Line Items</div>
          <div className="text-xs text-muted-foreground">{detail?.items?.length || 0} items</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Item</th>
                <th className="px-5 py-3 font-medium">Qty</th>
                <th className="px-5 py-3 font-medium">Unit Price</th>
                <th className="px-5 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(detail?.items || []).map((it) => (
                <tr key={it.id} className="border-t border-border/60">
                  <td className="px-5 py-3 text-muted-foreground">{it.sku}</td>
                  <td className="px-5 py-3">{it.product_name}</td>
                  <td className="px-5 py-3">{it.qty}</td>
                  <td className="px-5 py-3">{it.unit_price_fmt}</td>
                  <td className="px-5 py-3 text-right">{it.line_total_fmt}</td>
                </tr>
              ))}

              {(!detail?.items || detail.items.length === 0) && (
                <tr className="border-t border-border/60">
                  <td className="px-5 py-6 text-center text-muted-foreground" colSpan={5}>
                    No items found for this order.
                  </td>
                </tr>
              )}

              <tr className="border-t border-border bg-muted/20">
                <td className="px-5 py-3 font-semibold" colSpan={4}>
                  Grand Total
                </td>
                <td className="px-5 py-3 text-right font-semibold">{detail?.total_amount_fmt || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseOrders() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [detailsById, setDetailsById] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [detailErrorById, setDetailErrorById] = useState({});

  // view-details modal
  const [openDetailId, setOpenDetailId] = useState(null);

  // Print & Download
  const [printId, setPrintId] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [downloadId, setDownloadId] = useState(null);

  // new order modal
  const [openNewOrder, setOpenNewOrder] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [newOrderErr, setNewOrderErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    supplier_id: "",
    warehouse_id: "",
    expected_date: "",
    items: [{ product_id: "", ordered_qty: 1 }],
  });

  // If user clicked "Place Order" from Suppliers page, open New Order with supplier pre-selected.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const pre = localStorage.getItem("preselectSupplierId");
      if (pre) {
        setOpenNewOrder(true);
        setForm((prev) => ({ ...prev, supplier_id: String(pre) }));
        localStorage.removeItem("preselectSupplierId");
      }
    } catch { }
  }, []);


  const modalScrollLock = Boolean(openDetailId || openNewOrder);

  useEffect(() => {
    if (!modalScrollLock) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [modalScrollLock]);

  const loadOrders = async () => {
    const rows = await fetchJson(`${apiBase()}/purchase-orders`);
    const mapped = Array.isArray(rows)
      ? rows.map((po) => ({
        dbId: po.id,
        id: po.po_number || `PO-${po.id}`,
        supplier: po.supplier_name || "—",
        date: formatDate(po.created_at),
        items: Number(po.items_count || 0),
        total: formatMoney(po.total_amount || 0),
        status: normalizeStatus(po.status),
        eta: po.expected_date ? formatDate(po.expected_date) : "—",
      }))
      : [];
    setOrders(mapped);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        await loadOrders();
      } catch (e) {
        if (alive) setError(e?.message || "Failed to load purchase orders.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) => (o.id || "").toLowerCase().includes(q) || (o.supplier || "").toLowerCase().includes(q)
    );
  }, [search, orders]);

  const activeCount = orders.filter((o) => o.status === "pending" || o.status === "in_transit").length;

  const poSummary = useMemo(() => {
    const counts = { arrived: 0, pending: 0 };
    for (const o of orders) {
      if (o.status === "delivered") counts.arrived += 1;
      else counts.pending += 1;
    }
    return counts;
  }, [orders]);

  const ensureDetail = async (dbId) => {
    if (detailsById[dbId]) return detailsById[dbId];

    try {
      setDetailLoadingId(dbId);
      setDetailErrorById((p) => ({ ...p, [dbId]: "" }));

      const detail = await fetchJson(`${apiBase()}/purchase-orders/${dbId}`);

      const items = Array.isArray(detail?.items)
        ? detail.items.map((it) => ({
          id: it.id ?? `${it.sku}-${Math.random()}`,
          product_id: it.product_id,
          sku: it.sku || "—",
          product_name: it.product_name || "—",
          qty: Number(it.qty || 0),
          unit_price_fmt: formatMoney(it.unit_price || 0),
          line_total_fmt: formatMoney(it.line_total || 0),
        }))
        : [];

      const normalized = {
        ...detail,
        created_at_fmt: formatDate(detail.created_at),
        created_at_dt_fmt: formatDateTime(detail.created_at),
        expected_date_fmt: detail.expected_date ? formatDate(detail.expected_date) : "—",
        total_amount_fmt: formatMoney(detail.total_amount || 0),
        items,
      };

      setDetailsById((p) => ({ ...p, [dbId]: normalized }));
      return normalized;
    } catch (e) {
      setDetailErrorById((p) => ({ ...p, [dbId]: e?.message || "Failed to load details." }));
      return null;
    } finally {
      setDetailLoadingId(null);
    }
  };

  const toggleExpand = async (order) => {
    const isOpen = expandedId === order.dbId;
    if (isOpen) {
      setExpandedId(null);
      return;
    }
    setExpandedId(order.dbId);
    await ensureDetail(order.dbId);
  };

  const openDetailModal = async (dbId) => {
    setOpenDetailId(dbId);
    await ensureDetail(dbId);
  };
  const closeDetailModal = () => setOpenDetailId(null);

  const openDetail = openDetailId ? detailsById[openDetailId] : null;
  const openDetailLoading = openDetailId && detailLoadingId === openDetailId;
  const openDetailError = openDetailId ? detailErrorById[openDetailId] : "";

  const handleDeletePurchaseOrder = async (poId) => {
    try {
      setDeletingId(poId);
      await deletePurchaseOrder(poId);
      toast({
        title: "Purchase Order Deleted",
        description: `Purchase order ${poId} has been successfully deleted.`,
      });
      await loadOrders(); // Reload the list of orders
    } catch (e) {
      toast({
        title: "Error Deleting Purchase Order",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditOrder = async (order) => {
    setEditingId(order.dbId);
    setOpenNewOrder(true);
    setNewOrderErr("");

    try {
      const detail = await ensureDetail(order.dbId);
      if (!detail) throw new Error("Could not load order details.");

      setForm({
        supplier_id: String(detail.supplier_id || ""),
        warehouse_id: String(detail.warehouse_id || ""),
        expected_date: detail.expected_date ? detail.expected_date.split("T")[0] : "",
        items: detail.items.map((it) => ({
          id: it.id,
          product_id: String(it.product_id),
          ordered_qty: it.qty,
        })),
        status: detail.status,
      });

      // Load options
      const [suppliers, warehouses, products] = await Promise.all([
        fetchJson(`${apiBase()}/suppliers`),
        fetchJson(`${apiBase()}/warehouses`),
        fetchJson(`${apiBase()}/products`),
      ]);
      setSupplierOptions(Array.isArray(suppliers) ? suppliers : []);
      setWarehouseOptions(Array.isArray(warehouses) ? warehouses : []);
      setProductOptions(Array.isArray(products) ? products : []);
    } catch (e) {
      setNewOrderErr(e?.message || "Failed to load order for editing.");
    }
  };

  const [generatingInvoiceId, setGeneratingInvoiceId] = useState(null);

  const handleGenerateInvoice = async (poId) => {
    try {
      setGeneratingInvoiceId(poId);
      const res = await generatePurchaseInvoice(poId);
      toast({
        title: "Invoice Generated",
        description: `Purchase Invoice ${res.invoice_number} has been successfully created.`,
      });
    } catch (e) {
      toast({
        title: "Error Generating Invoice",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingInvoiceId(null);
    }
  };

  // ===== NEW ORDER =====
  const resetNewOrder = () => {
    setNewOrderErr("");
    setCreating(false);
    setForm({
      supplier_id: "",
      warehouse_id: "",
      expected_date: "",
      items: [{ product_id: "", ordered_qty: 1 }],
    });
  };

  const openNewOrderModal = async () => {
    setEditingId(null);
    setOpenNewOrder(true);
    setNewOrderErr("");
    try {
      const [suppliers, warehouses, products] = await Promise.all([
        fetchJson(`${apiBase()}/suppliers`),
        fetchJson(`${apiBase()}/warehouses`),
        fetchJson(`${apiBase()}/products`),
      ]);
      setSupplierOptions(Array.isArray(suppliers) ? suppliers : []);
      setWarehouseOptions(Array.isArray(warehouses) ? warehouses : []);
      setProductOptions(Array.isArray(products) ? products : []);
    } catch (e) {
      setNewOrderErr(e?.message || "Failed to load dropdown data.");
    }
  };

  const closeNewOrderModal = () => {
    setOpenNewOrder(false);
    resetNewOrder();
  };

  const addItemRow = () => {
    setForm((p) => ({ ...p, items: [...p.items, { product_id: "", ordered_qty: 1 }] }));
  };

  const removeItemRow = (idx) => {
    setForm((p) => {
      const next = p.items.filter((_, i) => i !== idx);
      return { ...p, items: next.length ? next : [{ product_id: "", ordered_qty: 1 }] };
    });
  };

  const updateItem = (idx, patch) => {
    setForm((p) => {
      const next = p.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      return { ...p, items: next };
    });
  };

  const productById = useMemo(() => {
    const m = new Map();
    for (const p of productOptions) m.set(String(p.id), p);
    return m;
  }, [productOptions]);

  const calcPreviewTotal = () => {
    let total = 0;
    for (const it of form.items) {
      const prod = productById.get(String(it.product_id));
      const price = Number(prod?.unit_price || 0);
      const qty = Number(it.ordered_qty || 0);
      total += price * qty;
    }
    return formatMoney(total);
  };

  const submitNewOrder = async () => {
    try {
      setCreating(true);
      setNewOrderErr("");

      if (!form.supplier_id) throw new Error("Please select a supplier.");
      if (!form.warehouse_id) throw new Error("Please select a warehouse.");

      const cleanedItems = form.items
        .map((it) => ({
          id: it.id,
          product_id: Number(it.product_id),
          ordered_qty: Number(it.ordered_qty),
        }))
        .filter((it) => it.product_id && it.ordered_qty > 0);

      if (cleanedItems.length === 0) throw new Error("Add at least 1 line item.");

      const payload = {
        supplier_id: Number(form.supplier_id),
        warehouse_id: Number(form.warehouse_id),
        expected_date: form.expected_date ? form.expected_date : null,
        items: cleanedItems,
      };

      if (editingId) {
        payload.status = form.status;
        await updatePurchaseOrder(editingId, payload);
        toast({ title: "Order Updated", description: "The purchase order has been successfully updated." });
      } else {
        await postJson(`${apiBase()}/purchase-orders`, payload);
        toast({ title: "Order Created", description: "New purchase order has been successfully created." });
      }

      await loadOrders();
      if (editingId) {
        // Clear detail cache to force reload
        setDetailsById((p) => {
          const next = { ...p };
          delete next[editingId];
          return next;
        });
      }
      closeNewOrderModal();
    } catch (e) {
      setNewOrderErr(e?.message || "Failed to save order.");
    } finally {
      setCreating(false);
    }
  };

  // ===== PRINT & DOWNLOAD =====
  useEffect(() => {
    const handler = () => setPrinting(false);
    window.addEventListener("afterprint", handler);
    return () => window.removeEventListener("afterprint", handler);
  }, []);

  const handlePrint = async (dbId) => {
    await ensureDetail(dbId);
    setPrintId(dbId);
    setPrinting(true);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleDownload = async (dbId) => {
    const d = await ensureDetail(dbId);
    setDownloadId(dbId);
    // Wait for render
    setTimeout(() => {
      const element = document.getElementById("download-content");
      if (element) {
        const opt = {
          margin: 10,
          filename: `${d.po_number || "purchase-order"}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: true, scrollY: 0 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        };
        html2pdf()
          .set(opt)
          .from(element)
          .save()
          .then(() => {
            setDownloadId(null);
          });
      } else {
        setDownloadId(null);
      }
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Print-only rules: show ONLY #print-root */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Hide the whole app (Next.js root, modals, overlays, etc.) */
          body > * { display: none !important; }

          /* Show ONLY the print portal */
          #print-root { 
            display: block !important;
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            box-sizing: border-box !important;
            padding: 8mm !important;
            background: white !important;
            overflow: hidden !important; /* prevents tiny spill to page 2 */
          }

          /* Avoid splits inside the main card */
          .print-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          /* Remove heavy effects for print + reduce spacing */
          .shadow-sm, .shadow, .shadow-md, .shadow-lg, .shadow-xl, .shadow-2xl { box-shadow: none !important; }
          .rounded-2xl { border-radius: 10px !important; }

          /* Tighten paddings for print only */
          .p-6 { padding: 14px !important; }
          .p-5 { padding: 12px !important; }
          .px-6 { padding-left: 14px !important; padding-right: 14px !important; }
          .py-4 { padding-top: 10px !important; padding-bottom: 10px !important; }
          .px-5 { padding-left: 12px !important; padding-right: 12px !important; }
          .py-3 { padding-top: 8px !important; padding-bottom: 8px !important; }

          /* Slightly smaller typography for print */
          .text-xl { font-size: 1.05rem !important; }
          .text-base { font-size: 0.95rem !important; }
          .text-sm { font-size: 0.85rem !important; }
          .text-xs { font-size: 0.75rem !important; }

          /* Make sure dialog backdrops don't appear */
          .print-hide { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? "Loading orders…" : `${orders.length} orders · ${activeCount} active`}
          </p>
        </div>

        <button
          onClick={openNewOrderModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          New Order
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Arrived", count: poSummary.arrived, color: "text-success bg-success/10" },
          { label: "Pending", count: poSummary.pending, color: "text-warning bg-warning/10" },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className={cn("p-2 sm:p-2.5 rounded-xl shrink-0", s.color)}>
              <FileText size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search orders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        />
      </div>

      {error && (
        <div className="glass-card rounded-xl p-4 text-sm text-destructive bg-destructive/5 border border-destructive/20">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((order, i) => {
          const st = statusMap[order.status] || statusMap.pending;
          const isOpen = expandedId === order.dbId;

          const detail = detailsById[order.dbId];
          const isDetailLoading = detailLoadingId === order.dbId;
          const detailError = detailErrorById[order.dbId];

          return (
            <motion.div
              key={order.dbId ?? order.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass-card rounded-xl overflow-hidden"
            >
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/20 transition-colors"
              // onClick={() => toggleExpand(order)}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {order.id} <span className="text-muted-foreground font-normal">— {order.supplier}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {order.items} items · {order.total} · {order.date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {order.eta !== "—" && (
                    <span className="text-xs text-muted-foreground hidden sm:block">ETA: {order.eta}</span>
                  )}
                  <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", st.style)}>{st.label}</span>
                  
                  <div className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10 transition-colors",
                            deletingId === order.dbId && "animate-pulse opacity-50 pointer-events-none"
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Purchase Order</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to delete <strong>{order.id}</strong>? This action cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                          </DialogClose>
                          <Button variant="destructive" onClick={() => handleDeletePurchaseOrder(order.dbId)}>
                            Delete Order
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditOrder(order);
                      }}
                    >
                      <Pencil size={16} />
                    </Button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetailModal(order.dbId);
                      }}
                      className="text-xs font-medium px-4 py-2 rounded-xl gradient-primary text-primary-foreground shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </div>

              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  className="border-t border-border px-4 pb-4"
                >
                  {isDetailLoading && <div className="text-sm text-muted-foreground mt-4">Loading items…</div>}
                  {detailError && !isDetailLoading && <div className="text-sm text-destructive mt-4">{detailError}</div>}

                  {detail && !isDetailLoading && !detailError && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground border-b border-border">
                            <th className="py-2 font-medium">SKU</th>
                            <th className="py-2 font-medium">Item</th>
                            <th className="py-2 font-medium">Qty</th>
                            <th className="py-2 font-medium">Unit Price</th>
                            <th className="py-2 font-medium text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.items.map((it) => (
                            <tr key={it.id} className="border-b border-border/40 last:border-0">
                              <td className="py-2 text-muted-foreground">{it.sku}</td>
                              <td className="py-2">{it.product_name}</td>
                              <td className="py-2">{it.qty}</td>
                              <td className="py-2">{it.unit_price_fmt}</td>
                              <td className="py-2 text-right">{it.line_total_fmt}</td>
                            </tr>
                          ))}

                          {detail.items.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                                No items found for this order.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      <div className="flex justify-between items-center mt-4">
                        <div className="text-sm text-muted-foreground">
                          Total: <span className="font-semibold text-foreground">{detail.total_amount_fmt}</span>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrint(order.dbId);
                            }}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                          >
                            Print
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateInvoice(order.dbId);
                            }}
                            disabled={generatingInvoiceId === order.dbId}
                            className={cn(
                              "text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors",
                              generatingInvoiceId === order.dbId && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {generatingInvoiceId === order.dbId ? "Generating…" : "Generate Invoice"}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(order.dbId);
                            }}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                            title="Download PDF"
                          >
                            <Download size={14} />
                          </button>


                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                onClick={(e) => e.stopPropagation()} // Prevent parent click from collapsing
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete Purchase Order</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Are you absolutely sure?</DialogTitle>
                                <DialogDescription>
                                  This action cannot be undone. This will permanently delete purchase order{" "}
                                  <span className="font-semibold">{order.id}</span> and remove its data from our servers.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <DialogClose asChild>
                                  <Button variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button variant="destructive" onClick={() => handleDeletePurchaseOrder(order.dbId)}>
                                  Delete
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>

                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div className="glass-card rounded-xl p-10 text-center text-sm text-muted-foreground">No orders found.</div>
        )}
      </div>

      {/* ===== Full Details Modal ===== */}
      <AnimatePresence>
        {openDetailId && (
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={closeDetailModal}
          >
            <div className="absolute inset-0 bg-black/35 backdrop-blur-sm print-hide" />

            <div className="absolute inset-0 flex items-center justify-center p-4 print-hide">
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.985 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
                className="relative w-full max-w-4xl h-[86vh] rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Purchase Order</div>
                    <div className="mt-0.5 text-xl font-semibold tracking-tight truncate">
                      {openDetail?.po_number || "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {openDetail ? <StatusChip status={openDetail.status} /> : null}
                    <button
                      onClick={closeDetailModal}
                      className="p-2 rounded-xl hover:bg-muted transition-colors"
                      aria-label="Close"
                    >
                      <X size={18} className="text-muted-foreground" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {openDetailLoading && <div className="p-6 text-sm text-muted-foreground">Loading details…</div>}
                  {openDetailError && !openDetailLoading && (
                    <div className="p-6 text-sm text-destructive">{openDetailError}</div>
                  )}

                  {openDetail && !openDetailLoading && !openDetailError && <DetailSheet detail={openDetail} />}
                </div>

                <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-card">
                  <button
                    onClick={() => handlePrint(openDetailId)}
                    className="text-sm font-medium px-4 py-2 rounded-xl border border-border hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <Printer size={14} />
                    Print
                  </button>

                  <button
                    onClick={() => handleGenerateInvoice(openDetailId)}
                    disabled={generatingInvoiceId === openDetailId}
                    className={cn(
                      "text-sm font-medium px-4 py-2 rounded-xl border border-border hover:bg-muted transition-colors flex items-center gap-2",
                      generatingInvoiceId === openDetailId && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {generatingInvoiceId === openDetailId ? "Generating…" : "Generate Invoice"}
                  </button>
                  <button
                    onClick={() => handleDownload(openDetailId)}
                    className="text-sm font-medium px-4 py-2 rounded-xl border border-border hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <Download size={16} />
                    Download
                  </button>

                  {/* <button
                    onClick={closeDetailModal}
                    className="text-sm font-medium px-4 py-2 rounded-xl gradient-primary text-primary-foreground shadow-sm"
                  >
                    Done
                  </button> */}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Hidden download content ===== */}
      {downloadId && detailsById[downloadId] && (
        <div
          id="download-content"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "210mm",
            minHeight: "297mm",
            padding: "8mm",
            background: "#ffffff",
            color: "#000000",
            zIndex: -9999,
          }}
        >
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "0.75rem", padding: "1.5rem", backgroundColor: "#ffffff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e5e7eb", paddingBottom: "1rem", marginBottom: "1rem" }}>
              <div>
                <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Purchase Order</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#111827" }}>{detailsById[downloadId].po_number}</div>
                <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>
                  Generated: {detailsById[downloadId].created_at_dt_fmt}
                </div>
              </div>
              <StatusChip status={detailsById[downloadId].status} isPdf={true} />
            </div>
            <DetailSheet detail={detailsById[downloadId]} isPdf={true} />
          </div>
        </div>
      )}

      {/* ===== Hidden print root (same DOM, same Tailwind styles) ===== */}
      <PrintPortal>
        {printing && printId && detailsById[printId] && (
          <div className="max-w-[820px] mx-auto">
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden print-card">
              <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Purchase Order</div>
                  <div className="mt-0.5 text-xl font-semibold tracking-tight truncate">
                    {detailsById[printId]?.po_number || "—"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Generated: {detailsById[printId]?.created_at_dt_fmt || "—"}
                  </div>
                </div>
                <StatusChip status={detailsById[printId]?.status} />
              </div>
              <DetailSheet detail={detailsById[printId]} />
            </div>
          </div>
        )}
      </PrintPortal>

      {/* ===== New Order Modal ===== */}
      <AnimatePresence>
        {openNewOrder && (
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={closeNewOrderModal}
          >
            <div className="absolute inset-0 bg-black/35 backdrop-blur-sm print-hide" />
            <div className="absolute inset-0 flex items-center justify-center p-4 print-hide">
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.985 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
                className="relative w-full max-w-3xl h-[86vh] rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
                  <div className="min-w-0">

                    <div className="mt-0.5 text-xl font-semibold tracking-tight">
                      {editingId ? `Edit ${editingId}` : "New Purchase Order"}
                    </div>
                  </div>

                  <button
                    onClick={closeNewOrderModal}
                    className="p-2 rounded-xl hover:bg-muted transition-colors"
                    aria-label="Close"
                  >
                    <X size={18} className="text-muted-foreground" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <div className="p-6 space-y-6">
                    {newOrderErr && (
                      <div className="rounded-xl p-3 text-sm text-destructive bg-destructive/5 border border-destructive/20">
                        {newOrderErr}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <div className="text-base font-semibold">General</div>

                        <div className="mt-4 space-y-3">
                          <label className="block text-sm">
                            <span className="text-muted-foreground text-xs">Supplier</span>
                            <select
                              value={form.supplier_id}
                              onChange={(e) => setForm((p) => ({ ...p, supplier_id: e.target.value }))}
                              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              <option value="">Select supplier…</option>
                              {supplierOptions.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-sm">
                            <span className="text-muted-foreground text-xs">Warehouse</span>
                            <select
                              value={form.warehouse_id}
                              onChange={(e) => setForm((p) => ({ ...p, warehouse_id: e.target.value }))}
                              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              <option value="">Select warehouse…</option>
                              {warehouseOptions.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-sm">
                            <span className="text-muted-foreground text-xs">Expected Delivery</span>
                            <input
                              type="date"
                              value={form.expected_date}
                              onChange={(e) => setForm((p) => ({ ...p, expected_date: e.target.value }))}
                              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <div className="text-base font-semibold">Preview</div>
                        <div className="mt-4 grid grid-cols-1 gap-3">
                          <StatCard label="Line Items" value={`${form.items.length}`} />
                          <StatCard label="Estimated Total" value={calcPreviewTotal()} />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                        <div className="text-base font-semibold">Line Items</div>
                        <button
                          onClick={addItemRow}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground shadow-sm"
                        >
                          + Add Item
                        </button>
                      </div>

                      <div className="p-5 space-y-3">
                        {form.items.map((it, idx) => {
                          const selected = productById.get(String(it.product_id));
                          const price = selected ? formatMoney(selected.unit_price) : "—";
                          return (
                            <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                              <div className="md:col-span-7">
                                <label className="block text-sm">
                                  <span className="text-muted-foreground text-xs">Product</span>
                                  <select
                                    value={it.product_id}
                                    onChange={(e) => updateItem(idx, { product_id: e.target.value })}
                                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  >
                                    <option value="">Select product…</option>
                                    {productOptions.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.sku} — {p.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <div className="mt-1 text-xs text-muted-foreground">Unit price: {price}</div>
                              </div>

                              <div className="md:col-span-3">
                                <label className="block text-sm">
                                  <span className="text-muted-foreground text-xs">Quantity</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={it.ordered_qty}
                                    onChange={(e) => updateItem(idx, { ordered_qty: e.target.value })}
                                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                </label>
                              </div>

                              <div className="md:col-span-2 flex justify-end">
                                <button
                                  onClick={() => removeItemRow(idx)}
                                  className="h-10 px-3 rounded-xl border border-border hover:bg-muted transition-colors flex items-center gap-2 text-sm"
                                  title="Remove"
                                >
                                  <Trash2 size={16} />
                                  <span className="hidden sm:inline">Remove</span>
                                </button>

                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-card">
                  <button
                    onClick={closeNewOrderModal}
                    className="text-sm font-medium px-4 py-2 rounded-xl border border-border hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitNewOrder}
                    disabled={creating}
                    className={cn(
                      "text-sm font-medium px-4 py-2 rounded-xl gradient-primary text-primary-foreground shadow-sm",
                      creating && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    {creating ? (editingId ? "Saving…" : "Creating…") : (editingId ? "Save Changes" : "Create Order")}
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
