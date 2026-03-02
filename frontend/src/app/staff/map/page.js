"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { WmsProvider, useWms } from "@/context/WmsContext";
import { ChevronDown, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

// --- Zone Color Map ---
const ZONE_PRESETS = {
  General:      { color: "#696969ff" },
  Receiving:    { color: "#fb923c" },
  Picking:      { color: "#34d399" },
  "Bulk Storage": { color: "#60a5fa" },
  "Cold Storage": { color: "#22d3ee" },
  Hazmat:       { color: "#f87171" },
  Apparel:      { color: "#f472b6" },
  Packing:      { color: "#94a3b8" },
};

// --- Read-Only Shelf ---
function ReadOnlyShelf({ shelf, PPM, suggestedItem }) {
  const shelfCode = shelf.shelf_code || shelf.name || "";
  const bayMatch = shelfCode.match(/-B(\d+)-/);
  const bayLabel = bayMatch ? `B${bayMatch[1]}` : shelfCode;
  const isPlaced = suggestedItem?.status === "placed";
  const isPending = suggestedItem && !isPlaced;
  const isInactive = (shelf.status || "").toLowerCase() !== "active";

  return (
    <div
      className={`absolute border-2 flex flex-col items-center justify-center rounded-sm text-center overflow-hidden transition-all
        ${isInactive ? "bg-rose-200 border-rose-600 opacity-80" : ""}
        ${!isInactive && isPlaced ? "bg-emerald-100 border-emerald-500" : ""}
        ${!isInactive && isPending ? "bg-yellow-100 border-yellow-500 animate-pulse" : ""}
        ${!isInactive && !suggestedItem ? "bg-white border-gray-300" : ""}
      `}
      style={{
        left: `${(shelf.location_x - (shelf._zoneX || 0)) * PPM}px`,
        top: `${(shelf.location_y - (shelf._zoneY || 0)) * PPM}px`,
        width: `${shelf.width * PPM}px`,
        height: `${shelf.depth * PPM}px`,
      }}
      title={shelfCode}
    >
      <span className="text-[7px] font-bold text-gray-700 leading-tight px-0.5">{bayLabel}</span>
      {!isInactive && isPending && (
        <span className="text-[5px] font-bold text-amber-700 leading-tight">PENDING</span>
      )}
      {!isInactive && isPlaced && (
        <span className="text-[5px] font-bold text-emerald-700 leading-tight">PLACED</span>
      )}
      {isInactive && (
        <span className="text-[5px] font-bold text-rose-700 leading-tight">INACTIVE</span>
      )}
    </div>
  );
}

// --- Read-Only Zone ---
function ReadOnlyZone({ zone, PPM, zoneShelves, suggestedItems, onZoneHover, onZoneLeave }) {
  const preset = ZONE_PRESETS[zone.zone_type] || ZONE_PRESETS["General"];
  const baseColor = zone.color || preset.color;

  return (
    <div
      className="absolute border-2 rounded-sm"
      style={{
        left: `${(zone.location_x || 0) * PPM}px`,
        top: `${(zone.location_y || 0) * PPM}px`,
        width: `${(zone.width || 5) * PPM}px`,
        height: `${(zone.depth || 5) * PPM}px`,
        backgroundColor: `${baseColor}30`,
        borderColor: baseColor,
      }}
      title={`${zone.zone_name || "Zone"} • ${zone.zone_type || "Type"} • ${(zone.product_category || zone.category || "Category")}`}
      onMouseEnter={(e) => onZoneHover && onZoneHover(zone, e)}
      onMouseMove={(e) => onZoneHover && onZoneHover(zone, e)}
      onMouseLeave={() => onZoneLeave && onZoneLeave()}
    >
      {/* Zone label */}
      <span
        className="absolute top-1 left-1 text-[8px] font-bold select-none px-1 py-0.5 rounded"
        style={{ color: baseColor, backgroundColor: `${baseColor}20` }}
      >
        {zone.zone_name}
      </span>

      {/* Shelves inside zone */}
      {zoneShelves.map((shelf) => (
        <ReadOnlyShelf
          key={shelf.id}
          shelf={{ ...shelf, _zoneX: zone.location_x, _zoneY: zone.location_y }}
          PPM={PPM}
          suggestedItem={suggestedItems[shelf.id]}
        />
      ))}
    </div>
  );
}

// --- Read-Only Area ---
function ReadOnlyArea({ area, PPM }) {
  const isPassable = area.is_passable ?? true;
  return (
    <div
      className={`absolute border-2 flex items-center justify-center rounded-sm ${
        isPassable ? "bg-emerald-500/30 border-emerald-600" : "bg-rose-500/60 border-rose-700"
      }`}
      style={{
        left: `${(area.location_x || 0) * PPM}px`,
        top: `${(area.location_y || 0) * PPM}px`,
        width: `${(area.width || 2) * PPM}px`,
        height: `${(area.depth || 2) * PPM}px`,
      }}
    >
      <span className="text-[7px] font-bold text-white text-center leading-tight px-0.5 drop-shadow">
        {area.area_name || "AREA"}
      </span>
    </div>
  );
}

// --- Main Map Content ---
function MapContent() {
  const { user } = useAuth();
  const { state } = useWms();
  const [currentFloorId, setCurrentFloorId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [pendingPlacements, setPendingPlacements] = useState([]);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [hoverInfo, setHoverInfo] = useState(null);

  // Set default floor
  useEffect(() => {
    if (state.warehouses?.length > 0 && user?.warehouse_id && !currentFloorId) {
      const myWh = state.warehouses.find((wh) => wh.id === user.warehouse_id);
      if (myWh?.floors?.length > 0) {
        const floor = myWh.floors.find((f) => f.floor_number === 0) || myWh.floors[0];
        if (floor) setCurrentFloorId(floor.id);
      }
    }
  }, [state.warehouses, user, currentFloorId]);

  // Fetch pending placements
  useEffect(() => {
    const warehouseId = user?.warehouse_id;
    if (!warehouseId) return;
    const fetchPending = async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/receiving/pending-placements?warehouse_id=${warehouseId}`
        );
        if (res.ok) setPendingPlacements(await res.json());
      } catch (e) { /* silent */ }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, [user?.warehouse_id]);

  // Build suggestedItems map
  const suggestedItems = useMemo(() => {
    const items = {};
    pendingPlacements.forEach((item) => {
      if (!item.shelf_id) return;
      const id = item.shelf_id;
      if (!items[id]) {
        items[id] = { skus: [], status: "placed" };
      }
      if (item.status === "suggested" || item.status === "pending") {
        items[id].status = "suggested";
      }
      if (item.sku && !items[id].skus.includes(item.sku)) {
        items[id].skus.push(item.sku);
      }
    });
    return items;
  }, [pendingPlacements]);

  const BASE_PPM = 30;
  const PPM = BASE_PPM * zoomLevel;

  // Auto-fit: recalculate when warehouse dims or container size change
  useEffect(() => {
    const wM = state.warehouseDims?.widthM;
    const dM = state.warehouseDims?.depthM;
    if (!wM || !dM || !containerRef.current) return;
    const containerW = containerRef.current.clientWidth || window.innerWidth - 32;
    const containerH = window.innerHeight * 0.55; // ~55vh for the canvas area
    const fitW = containerW / (wM * BASE_PPM);
    const fitH = containerH / (dM * BASE_PPM);
    const fit = Math.min(fitW, fitH, 1); // Never zoom in above 100%
    const rounded = Math.max(0.25, parseFloat(fit.toFixed(2)));
    setFitZoom(rounded);
    setZoomLevel(rounded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.warehouseDims?.widthM, state.warehouseDims?.depthM]);

  // Center the canvas within the scroll container (initial view)
  useEffect(() => {
    const el = containerRef.current;
    const wM = state.warehouseDims?.widthM;
    const dM = state.warehouseDims?.depthM;
    if (!el || !wM || !dM) return;
    const canvasW = wM * PPM;
    const canvasH = dM * PPM;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (canvasW > cw) el.scrollLeft = Math.max(0, (canvasW - cw) / 2);
    if (canvasH > ch) el.scrollTop = Math.max(0, (canvasH - ch) / 2);
  }, [PPM, state.warehouseDims?.widthM, state.warehouseDims?.depthM]);

  const currentFloorZones = state.zones.filter((z) => z.floor_id === currentFloorId);
  const floorZoneIds = new Set(currentFloorZones.map((z) => z.id));
  const currentFloor = state.floors.find((f) => f.id === currentFloorId);
  const myWarehouse = state.warehouses.find((wh) => wh.id === user?.warehouse_id);

  const zoneShelves = (zone) =>
    state.shelves.filter((s) => s.zone_id === zone.id);

  const handleZoneHover = (zone, e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + 10;
    const y = e.clientY - rect.top + 10;
    setHoverInfo({
      zone,
      x,
      y,
    });
  };

  const handleZoneLeave = () => setHoverInfo(null);

  // Legend item counts
  const pendingCount = pendingPlacements.filter((p) => p.status === "suggested" || p.status === "pending").length;
  const placedCount = pendingPlacements.filter((p) => p.status === "placed").length;

  return (
      <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Warehouse Map</h2>
          <p className="text-sm text-muted-foreground">Live 2D layout view.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.2, z - 0.1))}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-[11px] font-mono w-9 text-center text-gray-500">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(3, z + 0.1))}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => setZoomLevel(fitZoom)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              title="Reset to Fit"
            >
              <RotateCcw size={12} />
            </button>
          </div>

          {/* Floor Switcher */}
          {myWarehouse?.floors?.length > 1 && (
            <div className="relative inline-block">
              <select
                value={currentFloorId || ""}
                onChange={(e) => setCurrentFloorId(parseInt(e.target.value))}
                className="appearance-none bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-indigo-400 shadow-sm cursor-pointer"
              >
                {myWarehouse.floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name || `Floor ${f.floor_number}`}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground bg-white border border-gray-100 rounded-lg px-3 py-2 shadow-sm">
        <span className="font-semibold text-gray-600">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-white border border-gray-300 inline-block" />
          Empty Shelf
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-400 animate-pulse inline-block" />
          Pending Put-Away ({pendingCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-500 inline-block" />
          Placed ({placedCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-600 inline-block" />
          Passable Area
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-rose-500/60 border border-rose-700 inline-block" />
          Obstacle
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="overflow-auto rounded-xl border border-gray-200 shadow-inner bg-slate-50 flex items-center justify-center min-h-[55vh]"
      >
        <div
          className="relative bg-white shadow-sm m-4"
          ref={canvasRef}
          style={{
            width: `${state.warehouseDims.widthM * PPM}px`,
            height: `${state.warehouseDims.depthM * PPM}px`,
            backgroundImage:
              "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)",
            backgroundSize: `${PPM}px ${PPM}px`,
          }}
        >
          {/* Zones */}
          {currentFloorZones.map((zone) => (
            <ReadOnlyZone
              key={zone.id}
              zone={zone}
              PPM={PPM}
              zoneShelves={zoneShelves(zone)}
              suggestedItems={suggestedItems}
              onZoneHover={handleZoneHover}
              onZoneLeave={handleZoneLeave}
            />
          ))}

          {/* Areas */}
          {currentFloor?.areas?.map((area, idx) => (
            <ReadOnlyArea key={area.id || idx} area={area} PPM={PPM} />
          ))}

          {/* Warehouse dimension label */}
          <div className="absolute -top-5 left-0 text-[9px] text-gray-400 font-mono">
            {(state.warehouseDims.widthM || 0).toFixed(1)}m × {(state.warehouseDims.depthM || 0).toFixed(1)}m
          </div>

          {hoverInfo && (
            <div
              className="absolute z-50 pointer-events-none text-[11px] bg-gray-900 text-white px-2 py-1 rounded shadow"
              style={{ left: hoverInfo.x, top: hoverInfo.y }}
            >
              <div className="font-semibold">
                {hoverInfo.zone.zone_name || "Zone"}
              </div>
              <div>Type: {hoverInfo.zone.zone_type || "—"}</div>
              <div>Category: {hoverInfo.zone.product_category || hoverInfo.zone.category || "—"}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Wrap in WmsProvider ---
export default function StaffMap() {
  return (
    <WmsProvider>
      <MapContent />
    </WmsProvider>
  );
}
