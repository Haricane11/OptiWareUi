"use client";

import { useEffect, useRef, useState, Suspense, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  Package,
  ScanLine,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
  Smartphone,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  MapPin,
  CheckCircle,
  Loader2,
  Search,
  X
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { generateBulkSuggestions, confirmPlacement } from "@/lib/api/receiving";
import { useToast } from "@/components/ui/use-toast";

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000";

const WS_PROTOCOL =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? "wss"
    : "ws";


const WS_HOST =
  typeof window !== "undefined"
    ? `${window.location.hostname}:8000`
    : "localhost:8000";

// const SCANNER_URL_BASE = "http://10.247.174.242:3000/scan";
const SCANNER_URL_BASE = "http://192.168.99.169:3000/scan";

function ReceiveContent() {
  const [sessionId, setSessionId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [scannerCount, setScannerCount] = useState(0);
  const [scannedItems, setScannedItems] = useState([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("measured");
  const [isGenerating, setIsGenerating] = useState(false);
  const [placementFailures, setPlacementFailures] = useState([]); // List of { receiptItemId, reason }
  const { user } = useAuth();
  const { toast } = useToast();
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const calculateMatchStatus = useCallback((scannedItem, invoiceLineItems) => {
    if (!invoiceLineItems || invoiceLineItems.length === 0) {
      return "no_invoice_match";
    }

    const matchedProduct = invoiceLineItems.find(
      (lineItem) => lineItem.sku === scannedItem.sku
    );

    if (!matchedProduct) {
      return "sku_mismatch";
    }

    if (matchedProduct.quantity === scannedItem.quantity) {
      return "fully_matched";
    } else {
      return "sku_matched_qty_mismatch";
    }
  }, []);

  // 1. Get session ID
  useEffect(() => {
    fetch(`${API_BASE}/api/qr-scan/session`)
      .then((r) => r.json())
      .then((d) => setSessionId(d.session_id))
      .catch(console.error);
  }, []);

  // 2. Fetch existing scanned items from MongoDB
  useEffect(() => {
    const fetchScannedItems = async () => {
      try {
        const res = await fetch(`${API_BASE}/scanned-items/`);
        if (res.ok) {
          const data = await res.json();
          const formattedData = data.map(item => {
            const itemId = item.id && item.id.trim() !== '' ? item.id : crypto.randomUUID();
            if (item.id === null || item.id === undefined || item.id.trim() === '') {
              console.warn(`Item received with invalid ID: ${item.id}. Generated fallback ID: ${itemId}`);
            }
            const scannedItemForMatch = { sku: item.sku, quantity: item.quantity };
            const matchStatus = item.po_ref ? calculateMatchStatus(scannedItemForMatch, item.invoice_line_items) : "no_po_ref";

            return {
              id: itemId,
              data: `${item.sku}|QTY:${item.quantity}|PO_Ref:${item.po_ref}`,
              timestamp: item.timestamp,
              status: item.status || "scanned",
              invoiceNumber: item.invoice_number,
              supplierName: item.supplier_name,
              invoiceLineItems: item.invoice_line_items,
              matchStatus: matchStatus,
              sku: item.sku,
              suggestion: item.suggestion,
              receiptItemId: item.receipt_item_id
            };
          });
          setScannedItems(formattedData);
        } else {
          console.error("Failed to fetch scanned items:", res.status, await res.text());
        }
      } catch (error) {
        console.error("Error fetching scanned items:", error);
      }
    };
    fetchScannedItems();
  }, []);

  // 3. Connect WebSocket as receiver
  useEffect(() => {
    if (!sessionId) return;

    function connect() {
      const ws = new WebSocket(
        `${WS_PROTOCOL}://${WS_HOST}/api/qr-scan/ws/${sessionId}?role=receiver`
      );
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setScannerCount(0);
        // Auto-reconnect after 2s
        reconnectTimer.current = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "qr_scanned") {
          const parts = msg.data.split("|");
          const extractValue = (part) => {
            const colonIndex = part.indexOf(':');
            return colonIndex !== -1 ? part.substring(colonIndex + 1).trim() : part.trim();
          };

          const sku = extractValue(parts[0]);
          const quantity = extractValue(parts[1]);
          const poRef = extractValue(parts[2]);

          let invoiceNumber = null;
          let supplierName = null;

          if (poRef) {
            try {
              const invoiceRes = await fetch(`${API_BASE}/purchase-invoices/by-po-number/${poRef}`);
              if (invoiceRes.ok) {
                const invoiceData = await invoiceRes.json();
                invoiceNumber = invoiceData.invoice_number;
                supplierName = invoiceData.supplier.name;
              } else {
                console.warn(`Invoice for PO_Ref ${poRef} not found.`);
              }
            } catch (error) {
              console.error(`Error fetching invoice for PO_Ref ${poRef}:`, error);
            }
          }

          const formattedData = `${sku}|QTY:${quantity}|PO_Ref:${poRef}`;
          
          let status = null;
          if (parts.length >= 4) {
            const fourthPart = extractValue(parts[3]);
            if (fourthPart === "Partial") {
              status = "Partial";
            }
          }

          const scannedItemData = {
            sku,
            quantity: parseInt(quantity, 10),
            po_ref: poRef,
            invoice_number: invoiceNumber,
            supplier_name: supplierName,
            status: status,
          };

          try {
            const saveRes = await fetch(`${API_BASE}/scanned-items/`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(scannedItemData),
            });
            if (saveRes.ok) {
              const savedItem = await saveRes.json();
              const savedItemId = savedItem.id && savedItem.id.trim() !== '' ? savedItem.id : crypto.randomUUID();
              if (savedItem.id === null || savedItem.id === undefined || savedItem.id.trim() === '') {
                console.warn(`Newly scanned item received with invalid ID: ${savedItem.id}. Generated fallback ID: ${savedItemId}`);
              }

              const scannedItemForMatch = { sku: savedItem.sku, quantity: savedItem.quantity };
                  const matchStatus = savedItem.po_ref ? calculateMatchStatus(scannedItemForMatch, savedItem.invoice_line_items) : "no_po_ref";

                   const newItem = {
                      id: savedItemId,
                      data: `${savedItem.sku}|QTY:${savedItem.quantity}|PO_Ref:${savedItem.po_ref}`,
                      timestamp: savedItem.timestamp,
                      status: savedItem.status || "scanned", 
                      invoiceNumber: savedItem.invoice_number,
                      supplierName: savedItem.supplier_name,
                      invoiceLineItems: savedItem.invoice_line_items,
                      matchStatus: matchStatus,
                      sku: savedItem.sku,
                      quantity: savedItem.quantity,
                      poRef: savedItem.po_ref
                    };

                   setScannedItems((prev) => [newItem, ...prev]);
            } else {
              console.error("Failed to save scanned item to backend:", saveRes.status, await saveRes.text());
            }
          } catch (error) {
            console.error("Error saving scanned item to backend:", error);
          }
        } else if (msg.type === "scanner_connected") {
          setScannerCount(msg.count);
        } else if (msg.type === "scanner_disconnected") {
          setScannerCount(msg.count || 0);
        }
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [sessionId]);

  const scannerUrl = sessionId
    ? `${SCANNER_URL_BASE}?session=${sessionId}`
    : "";

  const clearItems = () => setScannedItems([]);

  const filteredBySearch = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return scannedItems;
    return scannedItems.filter((it) => {
      const sku = (it.sku || "").toLowerCase();
      const shelf = (it.suggestion?.shelf_code || "").toLowerCase();
      return sku.includes(q) || shelf.includes(q);
    });
  }, [scannedItems, search]);

  const visibleItems = useMemo(() => {
    return filteredBySearch.filter(i => activeTab === "measured" ? i.receiptItemId : !i.receiptItemId);
  }, [filteredBySearch, activeTab]);

  return (
    <div className="space-y-5 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Receive Products</h2>
        <div className="flex items-center gap-3">
          <div className="relative w-[260px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by SKU or Shelf Code"
              className="w-full pl-9 pr-3 py-2 rounded-md bg-white border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {activeTab === "measured" && scannedItems.some(item => item.receiptItemId && !item.suggestion && item.matchStatus !== "placed_confirmed") && (
            <button
              disabled={isGenerating}
              onClick={async () => {
                try {
                  setIsGenerating(true);
                  setPlacementFailures([]);
                  const result = await generateBulkSuggestions(user?.warehouse_id || null);
                  
                  if (result.suggestions && result.suggestions.length > 0) {
                    setScannedItems(prev => prev.map(item => {
                      if (!item.receiptItemId) return item;
                      const sug = result.suggestions.find(s => String(s.receipt_item_id) === String(item.receiptItemId));
                      if (sug) {
                        return {
                          ...item,
                          matchStatus: "placed_confirmed",
                          status: "place_pending",
                          suggestion: {
                            shelf_id: sug.shelf_id,
                            shelf_code: sug.shelf_code,
                            zone_name: sug.zone_name,
                            aisle_num: sug.aisle_num,
                            bay_num: sug.bay_num,
                            level_num: sug.level_num
                          }
                        };
                      }
                      return item;
                    }));
                  }

                  if (result.failures && result.failures.length > 0) {
                    setPlacementFailures(result.failures);
                    setScannedItems(prev => prev.map(item => {
                      const fail = result.failures.find(f => String(f.receipt_item_id) === String(item.receiptItemId));
                      if (fail) {
                        return { ...item, matchStatus: "failed", failureReason: fail.reason };
                      }
                      return item;
                    }));

                    toast({
                      title: "Some Placements Failed",
                      description: `Could not place ${result.failures.length} items. See details in the list.`,
                      variant: "warning"
                    });
                  }

                  if (result.suggestions && result.suggestions.length > 0) {
                    toast({
                      title: "Placement Suggestions Generated",
                      description: `Created ${result.generated} suggestions.`,
                    });
                  }
                } catch (err) {
                  toast({
                    title: "Error",
                    description: err.message || "Failed to generate suggestions",
                    variant: "destructive",
                  });
                } finally {
                  setIsGenerating(false);
                }
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
              {isGenerating ? "Generating..." : "Generate Placement Suggestions"}
            </button>
          )}
          

        </div>
      </div>

      {/* View Segregation Tabs */}
      <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl w-fit border border-muted-foreground/10">
        <button
          onClick={() => setActiveTab("measured")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "measured"
              ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Measured
          <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded text-[10px]">
            {filteredBySearch.filter(i => i.receiptItemId).length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("unmeasured")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "unmeasured"
              ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Unmeasured
          <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded text-[10px]">
            {filteredBySearch.filter(i => !i.receiptItemId).length}
          </span>
        </button>
      </div>

      {/* Scanned items list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Package size={16} className="text-primary" />
            {activeTab === "measured" ? "Measured Items" : "Incoming items (Pending Measurement)"} ({
              visibleItems.length
            })
          </h3>
          {filteredBySearch.length > 0 && (
            <button
              onClick={clearItems}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 size={12} />
              Clear
            </button>
          )}
        </div>

        {/* Scrollable list container */}
        <div className="max-h-[80vh] overflow-y-auto pr-1">
          <div className="space-y-2.5">
          <AnimatePresence  mode="popLayout">
            {visibleItems.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card rounded-xl p-8 text-center"
              >
                <ScanLine
                  size={32}
                  className="mx-auto mb-3 text-muted-foreground opacity-40"
                />
                <p className="text-sm text-muted-foreground">
                  {activeTab === "measured" 
                    ? "No measured items yet. Staff must measure items first." 
                    : "No unmeasured items. All scanned items are processed."}
                </p>
              </motion.div>
            ) : (
              visibleItems.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={`glass-card rounded-xl p-4 flex items-center justify-between ${
                    item.matchStatus === "fully_matched" ? "border-l-4 border-green-500" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm font-mono truncate">
                      {item.data}
                    </p>
                    {item.invoiceNumber && item.supplierName && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Invoice: {item.invoiceNumber} | Supplier: {item.supplierName}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono opacity-60">{item.id}</span>
                      <span>·</span>
                      <span>
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  
                  {/* Status & Suggestion Logic */}
                  <div className="flex flex-col items-end gap-2 ml-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0">
                      {item.matchStatus === "placed_confirmed" ? (
                        <>
                          <CheckCircle size={14} className="text-emerald-500" />
                          <span className="text-emerald-500">Confirmed</span>
                        </>
                      ) : !item.receiptItemId ? (
                        <>
                          <AlertTriangle size={14} className="text-orange-500" />
                          <span className="text-orange-500">Not Measured</span>
                        </>
                      ) : item.matchStatus === "failed" ? (
                        <>
                          <AlertTriangle size={14} className="text-destructive font-bold" />
                          <span className="text-destructive font-bold">Placement Failed</span>
                        </>
                      ) : item.suggestion ? (
                        <>
                          <MapPin size={14} className="text-purple-500" />
                          <span className="text-purple-500">Suggested</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={14} className="text-blue-500" />
                          <span className="text-blue-500">Measured</span>
                        </>
                      )}
                    </div>

                    {item.matchStatus === "failed" && (
                      <div className="text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded border border-destructive/20 mt-1">
                        Reason: {item.failureReason}
                      </div>
                    )}

                    {item.suggestion && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-2 mt-1"
                      >
                        <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded cursor-default border ${
                          item.matchStatus === "placed_confirmed"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : "bg-primary/10 text-primary border-primary/20"
                        }`}>
                          <MapPin size={10} />
                          {item.matchStatus === "placed_confirmed" ? "Placed: " : "Suggest: "}
                          {item.suggestion.shelf_code}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
          </div>
        </div>
      </div>

    </div>
  );
}

export default function ManagerReceive() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          Loading…
        </div>
      }
    >
      <ReceiveContent />
    </Suspense>
  );
}
