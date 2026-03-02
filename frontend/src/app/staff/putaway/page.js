"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Navigation, ScanLine, ArrowRight, MapPin, CheckCircle2, Loader2, X, Truck, Package, PackageOpen, Boxes } from "lucide-react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { toast } from "sonner";

export default function StaffPutaway() {
  const { user } = useAuth();
  const isOutbound = user?.team === "Outbound";
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePath, setActivePath] = useState(null);
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const [scanMode, setScanMode] = useState(null); // 'product' | 'shelf' | null
  const [isProductScanned, setIsProductScanned] = useState(false);
  const [isShelfScanned, setIsShelfScanned] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const activeTask = activeTaskIndex !== undefined ? activePath?.tasks[activeTaskIndex] : null;

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user]);

  const fetchTasks = async () => {
    if (!user?.zone_id) {
      setPaths([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const endpoint = isOutbound 
        ? `delivery-notes/picking-tasks?zone_id=${user.zone_id}`
        : `receiving/putaway-tasks?zone_id=${user.zone_id}`;
        
      const res = await fetch(`http://localhost:8000/${endpoint}`);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      setPaths(data);
    } catch (err) {
      console.error(err);
      toast.error(`Could not load ${isOutbound ? "pick-up" : "put-away"} tasks`);
    } finally {
      setLoading(false);
    }
  };

  const handleStartPath = (path) => {
    setActivePath(path);
    setActiveTaskIndex(0);
    setIsProductScanned(false);
    setIsShelfScanned(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleScan = (results) => {
    if (!results || results.length === 0) return;
    const text = results[0]?.rawValue || results[0]?.text || "";
    if (!text) return;

    if (scanMode === "product") {
      // Parse SKU|QTY|PO-REF or fallback
      const parts = text.split("|");
      
      if (parts.length === 3) {
        const sku = parts[0].trim();
        // Remove "QTY:" prefix if present
        const qtyRaw = parts[1].trim().replace(/^QTY:/i, "");
        // Remove "PO:" prefix if present
        const poRaw = parts[2].trim().replace(/^PO:/i, "");
        
        const qtyMatch = parseInt(qtyRaw) === Number(activeTask.quantity);
        const skuMatch = sku === activeTask.sku;
        const poMatch = poRaw === String(activeTask.po_number || "");

        if (skuMatch && qtyMatch && poMatch) {
          setIsProductScanned(true);
          setScanMode(null);
          toast.success(`Verified: ${sku} (${qtyRaw} units) PO: ${poRaw}`);
        } else {
          let errorMsg = "Verification failed: ";
          if (!skuMatch) errorMsg += `SKU mismatch (${sku} vs ${activeTask.sku}). `;
          if (!qtyMatch) errorMsg += `QTY mismatch (${qtyRaw} vs ${activeTask.quantity}). `;
          if (!poMatch) errorMsg += `PO mismatch (${poRaw} vs ${activeTask.po_number}). `;
          toast.error(errorMsg);
        }
      } else {
        // Fallback for simple SKU-only scan if needed, or strictly enforce pipe format
        const skuScanned = parts[0];
        if (skuScanned === activeTask.sku) {
          setIsProductScanned(true);
          setScanMode(null);
          toast.success(`Product SKU verified: ${skuScanned}`);
        } else {
          toast.error(`Invalid format or SKU. Scanned: ${skuScanned}, Expected: ${activeTask.sku}`);
        }
      }
    } else if (scanMode === "shelf") {
      const expectedShelf = isOutbound ? activeTask.from : activeTask.to;
      if (text.trim().toUpperCase() === expectedShelf.trim().toUpperCase()) {
        setIsShelfScanned(true);
        setScanMode(null);
        toast.success("Shelf verified!");
      } else {
        toast.error(`Invalid shelf. Scanned: ${text}, Expected: ${expectedShelf}`);
      }
    }
  };

  const handleConfirmPlacement = async () => {
    if (!activeTask || !isProductScanned || !isShelfScanned) return;

    try {
      setIsConfirming(true);
      const endpoint = isOutbound ? "delivery-notes/confirm-pick" : "receiving/confirm-placement";
      const body = isOutbound ? { allocation_id: activeTask.id } : { receipt_item_id: activeTask.id };
      
      const res = await fetch(`http://localhost:8000/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Confirmation failed");

      toast.success(`${isOutbound ? "Pick-up" : "Placement"} confirmed: ${activeTask.product}`);
      
      // Move to next task in path OR finish path
      if (activeTaskIndex < activePath.tasks.length - 1) {
        setActiveTaskIndex(prev => prev + 1);
        setIsProductScanned(false);
        setIsShelfScanned(false);
        toast.info("Proceed to next stop...");
      } else {
        toast.success(`All items in this trip ${isOutbound ? "picked up" : "placed"}!`);
        setActivePath(null);
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
      toast.error(`Failed to confirm ${isOutbound ? "pick-up" : "placement"}`);
    } finally {
      setIsConfirming(false);
    }
  };

  if (loading && paths.length === 0 && user?.zone_id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="animate-spin text-primary" size={32} />
        <p className="text-sm text-muted-foreground">Loading tasks...</p>
      </div>
    );
  }

  if (user && !user.zone_id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center space-y-4">
        <div className="p-4 rounded-full bg-destructive/10 text-destructive">
          <X size={48} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight">Duty Not Assigned</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Your account has not been assigned a duty zone. Please contact your manager to assign you to a warehouse zone.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20">
      {/* Top Header: Floor and Zone */}
      {user?.floor_number !== undefined && user?.zone_name && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-lg text-primary">
            <MapPin size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Floor {user.floor_number}</p>
            <p className="text-sm font-black text-primary uppercase">{user.zone_name}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black tracking-tight text-foreground uppercase italic px-1">
          {isOutbound ? "Pick Up" : "Put-away"}
        </h2>
        <p className="text-[10px] text-muted-foreground font-medium tracking-tight px-2 py-1 bg-muted rounded-full italic">
          Logical Sequence Active
        </p>
      </div>
      {activePath ? (
        <div className="glass-card-elevated rounded-2xl p-5 border-primary/30 overflow-hidden">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2 text-xs text-primary font-semibold">
              <Navigation size={14} />
              ACTIVE TRIP: {activePath.equipment.toUpperCase()}
            </div>
            <button 
              onClick={() => setActivePath(null)}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            {activePath.tasks.map((task, index) => {
              const isDone = index < activeTaskIndex;
              const isActive = index === activeTaskIndex;
              const isLocked = index > activeTaskIndex;

              return (
                <div 
                  key={task.id} 
                  className={`border rounded-xl p-4 transition-all ${
                    isDone ? "border-green-500/30 bg-green-500/5 opacity-70" :
                    isActive ? "border-primary bg-background shadow-md shadow-primary/10" :
                    "border-border bg-muted/30 opacity-50"
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          isDone ? "bg-green-500/20 text-green-600" :
                          isActive ? "bg-primary/20 text-primary" :
                          "bg-foreground/10 text-muted-foreground"
                        }`}>
                          STOP {index + 1}
                        </span>
                        <p className={`font-bold text-sm leading-tight ${isDone ? "text-green-700" : isActive ? "" : "text-muted-foreground"}`}>
                          {task.product}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {task.quantity} units · {task.weight}kg · SKU: {task.sku}
                      </p>
                    </div>
                    {isDone && (
                      <div className="bg-green-500/20 text-green-600 p-1.5 rounded-full">
                        <CheckCircle2 size={18} />
                      </div>
                    )}
                  </div>

                  <div className={`flex items-center gap-2 text-xs rounded-lg p-2 ${
                    isActive ? "bg-muted/50" : "bg-transparent"
                  }`}>
                    <MapPin size={12} className={isDone ? "text-green-500" : isActive ? "text-muted-foreground" : "text-muted-foreground/50"} />
                    <span className="font-mono text-[10px]">{task.from}</span>
                    <ArrowRight size={10} className="text-muted-foreground/40 mx-1" />
                    <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                      isDone ? "bg-green-500/10 text-green-700" :
                      isActive ? "bg-primary/10 text-primary border border-primary/20" :
                      "text-muted-foreground"
                    }`}>
                      {task.to}
                    </span>
                    {!isDone && (
                      <span className="ml-auto text-[9px] font-medium text-muted-foreground px-1 bg-background rounded-full border border-border">
                        {task.distance}
                      </span>
                    )}
                  </div>

                  {/* Scanning UI for Active Task */}
                  {isActive && (
                    <div className="mt-4">
                      <div className="grid grid-cols-2 gap-2">
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setScanMode("product")}
                          disabled={isProductScanned}
                          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-medium text-[11px] transition-colors ${
                            isProductScanned 
                              ? "bg-green-500/10 text-green-600 border border-green-500/20" 
                              : "bg-primary/10 text-primary hover:bg-primary/20"
                          }`}
                        >
                          {isProductScanned ? <CheckCircle2 size={14} /> : <ScanLine size={14} />}
                          {isProductScanned ? "PRODUCT OK" : "SCAN PRODUCT"}
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setScanMode("shelf")}
                          disabled={isShelfScanned}
                          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-medium text-[11px] transition-colors ${
                            isShelfScanned 
                              ? "bg-green-500/10 text-green-600 border border-green-500/20" 
                              : "bg-primary/10 text-primary hover:bg-primary/20"
                          }`}
                        >
                          {isShelfScanned ? <CheckCircle2 size={14} /> : <ScanLine size={14} />}
                          {isShelfScanned ? "SHELF OK" : "SCAN SHELF"}
                        </motion.button>
                      </div>

                      {isProductScanned && isShelfScanned && (
                        <motion.button
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={handleConfirmPlacement}
                          disabled={isConfirming}
                          className="w-full mt-3 py-3 rounded-lg bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                        >
                          {isConfirming ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                          {isOutbound ? "Confirm Pick" : "Place Next"}
                        </motion.button>
                      )}

                      <AnimatePresence>
                        {scanMode && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 rounded-xl overflow-hidden border border-border bg-black relative"
                          >
                            <div className="absolute top-2 right-2 z-10">
                              <button 
                                onClick={() => setScanMode(null)}
                                className="bg-black/40 backdrop-blur-md rounded-full p-1 text-white/70 hover:text-white transition-colors"
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <div className="bg-primary/90 text-[10px] text-white py-1 px-3 text-center font-bold tracking-wider uppercase">
                              SCANNING {scanMode}: {scanMode === "product" ? task.sku : (isOutbound ? task.from : task.to)}
                            </div>
                            <div className="aspect-square w-full max-w-[280px] mx-auto">
                              <Scanner
                                onScan={handleScan}
                                allowMultiple={false}
                                styles={{ container: { width: "100%", height: "100%" } }}
                                components={{ audio: false, torch: true }}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-center gap-3">
          <div className="bg-primary/20 p-2.5 rounded-xl text-primary">
            <Navigation size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">No active route</p>
            <p className="text-xs text-muted-foreground tracking-tight">Select a task from the list below to start.</p>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 px-1 text-muted-foreground">
          <Boxes size={14} />
          PENDING TRIPS ({paths.length})
        </h3>
        <div className="space-y-3">
          {paths.length === 0 ? (
            <div className="text-center py-10 opacity-40">
              <CheckCircle2 className="mx-auto mb-2 text-green-500" size={32} />
              <p className="text-sm font-medium">All items {isOutbound ? "picked up" : "put away"}!</p>
            </div>
          ) : (
            paths.map((path, idx) => (
              <div key={idx} className="glass-card-elevated rounded-2xl p-4 border-border/40 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                  {path.equipment.includes("Reach") ? <Truck size={60} /> : <Package size={60} />}
                </div>
                
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                       {path.equipment.includes("Reach") ? (
                         <div className="bg-orange-500/10 text-orange-600 p-1.5 rounded-lg"><Truck size={18} /></div>
                       ) : path.equipment.includes("Forklift") ? (
                        <div className="bg-blue-500/10 text-blue-600 p-1.5 rounded-lg"><Boxes size={18} /></div>
                       ) : (
                         <div className="bg-green-500/10 text-green-600 p-1.5 rounded-lg"><Package size={18} /></div>
                       )}
                       <div>
                         <p className="text-sm font-black uppercase tracking-tight leading-none mb-0.5">{path.equipment}</p>
                         <p className="text-[10px] font-bold text-muted-foreground uppercase">{path.tasks.length} stops · {path.total_weight}</p>
                       </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleStartPath(path)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                  >
                    START TRIP <ArrowRight size={14} />
                  </button>
                </div>

                <div className="mt-3 pt-3 border-t border-dashed border-border/60">
                  <div className="flex items-center flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                      <MapPin size={10} /> {path.tasks[0].from}
                    </div>
                    {path.tasks.map((t, tidx) => {
                      // For outbound, we skip first task's shelf since it's the start, 
                      // and then show each subsequent shelf, finishing with the dock to.
                      if (isOutbound && tidx === 0) return null;
                      return (
                        <div key={tidx} className="flex items-center gap-1.5">
                          <ArrowRight size={10} className="text-muted-foreground/40" />
                          <div className="text-[10px] font-bold bg-primary/5 text-primary border border-primary/10 px-2 py-1 rounded-lg">
                            {isOutbound ? t.from : t.to}
                          </div>
                        </div>
                      );
                    })}
                    {isOutbound && (
                      <div className="flex items-center gap-1.5">
                        <ArrowRight size={10} className="text-muted-foreground/40" />
                        <div className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-1 rounded-lg">
                          {path.tasks[0].to}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
