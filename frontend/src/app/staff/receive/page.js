"use client";

import { useEffect, useRef, useState, Suspense, useCallback } from "react";
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
  XCircle
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { createReceiptItem, confirmPlacement } from "@/lib/api/receiving";
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

// const SCANNER_URL_BASE = "http://192.168.4.19:3000/scan";

function ReceiveContent() {
  const [sessionId, setSessionId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [scannerCount, setScannerCount] = useState(0);
  const [scannedItems, setScannedItems] = useState([]);
  const [copied, setCopied] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const [measurements, setMeasurements] = useState({}); // { itemId: { width, height, depth, weight } }
  
  const isOutbound = user?.team === "Outbound";

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const autoSavedRef = useRef({}); // Prevent duplicate auto-saves per item

  if (isOutbound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center space-y-4">
        <div className="p-4 rounded-full bg-destructive/10 text-destructive">
          <XCircle size={48} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight">Access Restricted</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            The Receiving page is not available for the Outbound team. Please use the Pick Up page for your tasks.
          </p>
          <button 
            onClick={() => window.location.href = "/staff/pickup"}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold"
          >
            Go to Pick Up
          </button>
        </div>
      </div>
    );
  }

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
    return "scanned";
  }, []);

  /** Get sku, quantity, poRef from item – from top-level fields or by parsing item.data ("SKU|PO:XXX"). */
  const getItemFields = useCallback((item) => {
    const extractValue = (part) => {
      if (part == null || part === "") return "";
      const i = String(part).indexOf(":");
      return i !== -1 ? String(part).substring(i + 1).trim() : String(part).trim();
    };
    if (item.sku != null && item.sku !== "" && item.quantity != null) {
      return {
        sku: String(item.sku).trim(),
        quantity: Number(item.quantity) || 0,
        poRef: item.poRef ?? item.po_ref ?? null
      };
    }
    if (!item.data || typeof item.data !== "string") {
      return { sku: "", quantity: 0, poRef: null };
    }
    const parts = item.data.split("|");
    const sku = extractValue(parts[0]) || (parts[0] || "").trim();
    let poRef = null;
    if (parts.length >= 2) {
      poRef = extractValue(parts[1]) || (parts[1] || "").trim() || null;
    }
    const quantity = Number(item.quantity) || 0;
    return { sku, quantity, poRef };
  }, []);

  // 1. Get session ID
  useEffect(() => {
    fetch(`${API_BASE}/api/qr-scan/session`)
      .then((r) => r.json())
      .then((d) => setSessionId(d.session_id))
      .catch(console.error);
  }, []);

  // 2. Fetch existing scanned items from MongoDB and Placement Suggestions from Postgres
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [scannedRes, suggestionsRes] = await Promise.all([
          fetch(`${API_BASE}/scanned-items/`),
          fetch(`${API_BASE}/receiving/placement-suggestions`)
        ]);

        let scannedData = [];
        if (scannedRes.ok) {
          scannedData = await scannedRes.json();
        } else {
          console.error("Failed to fetch scanned items:", scannedRes.status);
        }

        let suggestionsData = [];
        if (suggestionsRes.ok) {
          suggestionsData = await suggestionsRes.json();
        } else {
          console.error("Failed to fetch placement suggestions:", suggestionsRes.status);
        }

        // Map suggestions by receipt_item_id for easy lookup
        const suggestionsMap = suggestionsData.reduce((acc, sug) => {
          acc[sug.receipt_item_id] = sug;
          return acc;
        }, {});

        const formattedData = scannedData.map(item => {
          // Priority: item.id (backend _id string) -> generated UUID
          const itemId = item.id || crypto.randomUUID();
          
          const scannedItemForMatch = { sku: item.sku, quantity: item.quantity };
          const matchStatus = item.po_ref ? calculateMatchStatus(scannedItemForMatch, item.invoice_line_items) : "no_po_ref";

          return {
            id: itemId,
            data: `${item.sku}|PO:${item.po_ref}`,
            timestamp: item.timestamp,
            status: item.status || "scanned",
            invoiceNumber: item.invoice_number,
            supplierName: item.supplier_name,
            invoiceLineItems: item.invoice_line_items,
            matchStatus: matchStatus,
            suggestion: item.suggestion,
            receiptItemId: item.receipt_item_id
          };
        });
        setScannedItems(formattedData);

      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
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
          const poRef = parts.length >= 2 ? extractValue(parts[1]) : null;

          let invoiceNumber = null;
          let supplierName = null;
          let invoiceQty = 0;
          let invoiceLineItems = [];

          if (poRef) {
            try {
              const invoiceRes = await fetch(`${API_BASE}/purchase-invoices/by-po-number/${poRef}`);
              if (invoiceRes.ok) {
                const invoiceData = await invoiceRes.json();
                invoiceNumber = invoiceData.invoice_number;
                supplierName = invoiceData.supplier.name;
                invoiceLineItems = invoiceData.line_items || [];
                const matchedLine = invoiceLineItems.find(li => li.sku === sku);
                if (matchedLine) {
                  const totalQty = Number(matchedLine.quantity || 0);
                  invoiceQty = totalQty;
                }
              } else {
                console.warn(`Invoice for PO_Ref ${poRef} not found.`);
              }
            } catch (error) {
              console.error(`Error fetching invoice for PO_Ref ${poRef}:`, error);
            }
          }

          const formattedData = `${sku}|PO:${poRef}`;
          
          let status = null;
          // Optional status flag removed in new format

          const scannedItemData = {
            sku,
            quantity: invoiceQty || 0,
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
                      data: `${savedItem.sku}|PO:${savedItem.po_ref}`,
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

                   // AUTO-SUGGEST PLACEMENT DISABLED (Moved to manual trigger)
                   /*
                   if ((matchStatus === "fully_matched" || matchStatus === "sku_matched_qty_mismatch") && user?.warehouse_id) {
                     try {
                       // Find the batch number from invoice line items if possible
                       const matchedLine = savedItem.invoice_line_items?.find(li => li.sku === savedItem.sku);
                       const batchToUse = matchedLine?.batch_number || `BCT-${Date.now()}`;

                       const suggestion = await suggestPlacement({
                         sku: savedItem.sku,
                         quantity: savedItem.quantity,
                         po_number: savedItem.po_ref,
                         batch_number: batchToUse,
                         warehouse_id: user.warehouse_id
                       });
                       
                       // Persist suggestion to ScannedItem in MongoDB
                       try {
                          await fetch(`${API_BASE}/scanned-items/${savedItemId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              receipt_item_id: suggestion.receipt_item_id,
                              suggestion: suggestion.suggestion
                            })
                          });
                       } catch (patchErr) {
                          console.error("Failed to update scanned item with suggestion:", patchErr);
                       }

                       setScannedItems(prev => prev.map(it => 
                         it.id === savedItemId 
                           ? { ...it, suggestion: suggestion.suggestion, receiptItemId: suggestion.receipt_item_id } 
                           : it
                       ));

                       toast({
                         title: "Placement Suggested",
                         description: `Suggested shelf: ${suggestion.suggestion.shelf_code}`,
                       });
                     } catch (err) {
                       console.error("Placement suggestion failed:", err);
                     }
                   }
                   */
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

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(scannerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleSaveMeasurements = async (item, overrideMeasure) => {
    const { sku, quantity: qty, poRef } = getItemFields(item);

    const measure = overrideMeasure || measurements[item.id];
    if (!measure || !measure.width || !measure.height || !measure.depth || !measure.weight) {
      if (!overrideMeasure) {
        toast({
          title: "Missing Data",
          description: "Please enter all dimensions (Width, Height, Depth, Weight).",
          variant: "destructive"
        });
        return;
      }
    }

    if (!sku) {
      toast({
        title: "Missing SKU",
        description: "This item has no SKU. Cannot suggest placement.",
        variant: "destructive"
      });
      return;
    }

    if (user?.warehouse_id == null || user?.warehouse_id === undefined) {
      toast({
        title: "Warehouse required",
        description: "Your account has no warehouse assigned. Contact an admin.",
        variant: "destructive"
      });
      return;
    }

    if (!Number.isInteger(qty) || qty < 1) {
      toast({
        title: "Invalid quantity",
        description: "Quantity must be a positive integer.",
        variant: "destructive"
      });
      return;
    }

    try {
      const matchedLine = item.invoiceLineItems?.find(li => li.sku === sku);
      const batchToUse = matchedLine?.batch_number || `BCT-${sku}-${poRef || 'NA'}`;

      const result = await createReceiptItem({
        sku,
        quantity: qty,
        po_number: poRef || null,
        batch_number: batchToUse,
        warehouse_id: user.warehouse_id,
        measured_width: parseFloat(measure.width),
        measured_height: parseFloat(measure.height),
        measured_depth: parseFloat(measure.depth),
        measured_weight: parseFloat(measure.weight),
        scanned_item_id: item.id, // Pass MongoDB ID to update status
      });

      // Update scanned item in MongoDB (also done server-side via scanned_item_id)
      try {
        await fetch(`${API_BASE}/scanned-items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receipt_item_id: result.receipt_item_id,
            status: "measured",
          }),
        });
      } catch (patchErr) {
        console.error("Failed to update scanned item:", patchErr);
      }

      setScannedItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, receiptItemId: result.receipt_item_id, status: "measured" } : it
        )
      );

      toast({
        title: "Dimensions Saved",
        description: `Measurements captured for ${qty} x ${sku}.`,
      });
    } catch (err) {
      console.error("Saving to receipt failed:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to save to receipt",
        variant: "destructive",
      });
    }
  };

  const handleMeasurementChange = (itemId, field, value) => {
    setMeasurements(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { width: '', height: '', depth: '', weight: '' }),
        [field]: value
      }
    }));
  };

  // Auto-save measurements when (w x h x d) and weight are available from invoice line
  useEffect(() => {
    if (!Array.isArray(scannedItems) || scannedItems.length === 0) return;
    scannedItems.forEach((item) => {
      if (!item || item.receiptItemId) return;
      if (autoSavedRef.current[item.id]) return;
      const matchedLine = item.invoiceLineItems?.find(li => li.sku === item.sku);
      if (!matchedLine) return;
      const desc = matchedLine?.item_description || "";
      const dimMatch = desc.match(/\((\d+\.?\d*)x(\d+\.?\d*)x(\d+\.?\d*)m\)/);
      const invoiceWeight = matchedLine?.total_weight_kg || item.invoice_total_weight_kg || null;
      if (dimMatch && invoiceWeight) {
        const width = dimMatch[1];
        const height = dimMatch[2];
        const depth = dimMatch[3];
        const cur = measurements[item.id] || {};
        if (!cur.width || !cur.height || !cur.depth || !cur.weight) {
          setMeasurements(prev => ({
            ...prev,
            [item.id]: { ...(prev[item.id] || {}), width, height, depth, weight: invoiceWeight }
          }));
        }
        autoSavedRef.current[item.id] = true;
        // Call with override to bypass state race conditions and avoid "Missing Data" toast
        handleSaveMeasurements(item, { width, height, depth, weight: invoiceWeight });
      }
    });
  }, [scannedItems, measurements, handleSaveMeasurements]);

  const clearItems = () => setScannedItems([]);

  const handleConfirmPlacement = async (item) => {
    try {
      await confirmPlacement(item.receiptItemId);
      setScannedItems(prev => prev.map(it => 
        it.id === item.id ? { ...it, matchStatus: "placed_confirmed" } : it
      ));
      toast({
        title: "Placed Successfully",
        description: `Item ${getItemFields(item).sku} confirmed at ${item.suggestion.shelf_code}`,
      });
    } catch (err) {
      toast({
        title: "Confirmation Failed",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight">Receive Products</h2>
          <button
            onClick={() => setShowQrCode(!showQrCode)}
            className="px-2 py-1 text-xs font-medium rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
          >
            {showQrCode ? "Hide QR" : "Show QR"}
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Scan the QR code below with your phone to start scanning product codes.
        </p>
      </div>



      {/* QR Code for pairing */}
      {showQrCode && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-6 flex flex-col items-center gap-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ScanLine size={18} className="text-primary" />
            Scan with Phone to Connect
          </div>

          {sessionId ? (
            <>
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <QRCodeSVG
                  value={scannerUrl}
                  size={180}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0a0f1a"
                />
              </div>
              <div className="text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  Session:{" "}
                  <span className="font-mono font-semibold text-primary">
                    {sessionId}
                  </span>
                </p>
                <button
                  onClick={copyUrl}
                  className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? (
                    <>
                      <Check size={12} className="text-success" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={12} /> Copy scanner URL
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="h-[180px] w-[180px] rounded-xl bg-muted animate-pulse" />
          )}
        </motion.div>
      )}

      {/* Scanned items list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Package size={16} className="text-primary" />
            Incoming Items ({scannedItems.length})
          </h3>
          {scannedItems.length > 0 && (
            <button
              onClick={clearItems}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 size={12} />
              Clear
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          <AnimatePresence  mode="popLayout">
            {scannedItems.length === 0 ? (
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
                  No items scanned yet. Open the scanner on your phone to begin.
                </p>
              </motion.div>
            ) : (
              scannedItems.map((item, i) => (
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
                    
                    {/* Dimension Entry Form */}
                    {!item.receiptItemId && item.matchStatus !== "placed_confirmed" && (() => {
                      const matchedItem = item.invoiceLineItems?.find(li => li.sku === item.sku);
                      const desc = matchedItem?.item_description || "";
                      const dimMatch = desc.match(/\((\d+\.?\d*)x(\d+\.?\d*)x(\d+\.?\d*)m\)/);
                      
                      const parsedDim = dimMatch ? {
                        width: dimMatch[1],
                        height: dimMatch[2],
                        depth: dimMatch[3]
                      } : null;

                      // Prioritize line item weight, fallback to invoice total weight
                      const invoiceWeight = matchedItem?.total_weight_kg || item.invoice_total_weight_kg || null;

                      // Effect-like logic inside render to sync auto-detected values once
                      if (parsedDim || invoiceWeight) {
                        const current = measurements[item.id] || {};
                        let needsUpdate = false;
                        const update = { ...current };

                        if (parsedDim && !current.width && !current.height && !current.depth) {
                          update.width = parsedDim.width;
                          update.height = parsedDim.height;
                          update.depth = parsedDim.depth;
                          needsUpdate = true;
                        }
                        if (invoiceWeight && !current.weight) {
                          update.weight = invoiceWeight;
                          needsUpdate = true;
                        }

                        if (needsUpdate) {
                          setTimeout(() => {
                            setMeasurements(prev => ({
                              ...prev,
                              [item.id]: { ...(prev[item.id] || {}), ...update }
                            }));
                          }, 0);
                        }
                      }

                      return (
                        <div className="mt-3 p-3 bg-muted/30 rounded-lg space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            {/* Width, Height, Depth inputs - only show if NOT parsed */}
                            {!parsedDim && (
                              <>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-muted-foreground ml-1 uppercase">Width (m)</label>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    placeholder="0.00"
                                    className="w-full text-xs px-2 py-1.5 rounded-md border bg-background focus:ring-1 focus:ring-primary outline-none"
                                    value={measurements[item.id]?.width || ''}
                                    onChange={(e) => handleMeasurementChange(item.id, 'width', e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-muted-foreground ml-1 uppercase">Height (m)</label>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    placeholder="0.00"
                                    className="w-full text-xs px-2 py-1.5 rounded-md border bg-background focus:ring-1 focus:ring-primary outline-none"
                                    value={measurements[item.id]?.height || ''}
                                    onChange={(e) => handleMeasurementChange(item.id, 'height', e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-muted-foreground ml-1 uppercase">Depth (m)</label>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    placeholder="0.00"
                                    className="w-full text-xs px-2 py-1.5 rounded-md border bg-background focus:ring-1 focus:ring-primary outline-none"
                                    value={measurements[item.id]?.depth || ''}
                                    onChange={(e) => handleMeasurementChange(item.id, 'depth', e.target.value)}
                                  />
                                </div>
                              </>
                            )}

                            {/* Weight input - only show if NOT in invoice */}
                            {!invoiceWeight && (
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-foreground ml-1 uppercase">Weight (kg)</label>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  placeholder="0.00"
                                  className="w-full text-xs px-2 py-1.5 rounded-md border bg-background focus:ring-1 focus:ring-primary outline-none"
                                  value={measurements[item.id]?.weight || ''}
                                  onChange={(e) => handleMeasurementChange(item.id, 'weight', e.target.value)}
                                />
                              </div>
                            )}

                            {/* Display auto-detected info */}
                            {(parsedDim || invoiceWeight) && (
                              <div className="col-span-2 p-2 bg-blue-50/50 border border-blue-100 rounded-md">
                                <p className="text-[10px] text-blue-600 font-medium flex items-center gap-1">
                                  <Check size={10} />
                                  Auto-detected: 
                                  {parsedDim && ` [${parsedDim.width}x${parsedDim.height}x${parsedDim.depth}m]`}
                                  {invoiceWeight && ` [Weight: ${invoiceWeight}kg]`}
                                </p>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleSaveMeasurements(item)}
                            className="w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition-colors border border-primary/20 flex items-center justify-center gap-2"
                          >
                            <Check size={14} />
                            Done
                          </button>
                        </div>
                      );
                    })()}
                    {item.receiptItemId && !item.suggestion && item.matchStatus !== "placed_confirmed" && (
                        <div className="mt-3 p-3 bg-muted/10 border border-success/30 rounded-lg flex items-center gap-2">
                           <CheckCircle2 size={16} className="text-success" />
                           <span className="text-xs font-semibold text-success">Dimensions Saved. Waiting for Manager to generate placement.</span>
                        </div>
                    )}
                  </div>
                  
                  {/* Suggestion & Confirmation Actions */}
                  <div className="flex flex-col items-end gap-2 ml-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0">
                      {item.matchStatus === "placed_confirmed" ? (
                        <>
                          <CheckCircle size={14} className="text-emerald-500" />
                          <span className="text-emerald-500">Confirmed</span>
                        </>
                      ) : item.status === "Partial" ? (
                        <>
                          <AlertTriangle size={14} className="text-blue-500" />
                          <span className="text-blue-500">Partial</span>
                        </>
                      ) : item.matchStatus === "fully_matched" ? (
                        <>
                          <CheckCircle2 size={14} className="text-green-500" />
                          <span className="text-green-500">Received</span>
                        </>
                      ) : item.matchStatus === "sku_matched_qty_mismatch" ? (
                        <>
                          <AlertTriangle size={14} className="text-orange-500" />
                          <span className="text-orange-500">Qty Mismatch</span>
                        </>
                      ) : item.matchStatus === "sku_mismatch" ? (
                        <>
                          <AlertTriangle size={14} className="text-red-500" />
                          <span className="text-red-500">SKU Mismatch</span>
                        </>
                      ) : (
                        <>
                          <Clock size={14} className="text-muted-foreground" />
                          <span className="text-muted-foreground">Scanned</span>
                        </>
                      )}
                    </div>

                    {/* {item.suggestion && item.matchStatus !== "placed_confirmed" && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-end gap-1"
                      >
                        <div className="flex items-center gap-1 text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded cursor-default border border-primary/20">
                          <MapPin size={10} />
                          Suggest: {item.suggestion.shelf_code}
                        </div>
                        <button
                          onClick={() => handleConfirmPlacement(item)}
                          className="px-3 py-1 bg-primary text-white text-[10px] font-bold rounded-full hover:bg-primary/90 transition-all shadow-sm"
                        >
                          Confirm Placement
                        </button>
                      </motion.div>
                    )} */}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function StaffReceive() {
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
