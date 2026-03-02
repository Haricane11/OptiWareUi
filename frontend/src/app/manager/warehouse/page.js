/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import React, { useState, useRef, useEffect, useMemo, Suspense, Children } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Box, Layers, X, Info, Maximize2, Plus, Trash2, ChevronDown, MousePointer2, ZoomIn, ZoomOut, RotateCcw, RotateCw, FlipHorizontal, FlipVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import Draggable from 'react-draggable';
import { WmsProvider, useWms } from '../../../context/WmsContext';
import ShelfScene from '../../../components/ShelfScene';

import WarehouseWizard from '../../../components/WarehouseWizard';

const ZONE_PRESETS = {
  'General': { color: '#696969ff', shelfType: 'Standard Rack', label: 'General Storage' },
  'Receiving': { color: '#fb923c', shelfType: 'BULK_FLOOR_SPACE', label: 'Receiving & Inbound' },
  'Picking': { color: '#34d399', shelfType: 'CARTON_FLOW', label: 'High-Velocity Picking' },
  'Bulk Storage': { color: '#60a5fa', shelfType: 'Standard Rack', label: 'Reserve / Bulk Storage' },
  'Cold Storage': { color: '#22d3ee', shelfType: 'COLD_LOCKER', label: 'Cold / Frozen Zone' },
  'Hazmat': { color: '#f87171', shelfType: 'Standard Rack', label: 'Hazardous Materials' },
  'Apparel': { color: '#f472b6', shelfType: 'HANGING_RACK', label: 'GOH (Apparel)' },
  'Packing': { color: '#94a3b8', shelfType: 'BULK_FLOOR_SPACE', label: 'Packing & Shipping' },
};

const DraggableZone = ({ zone, PPM, handleStop, startResize, removeZone, children, isDragging, setIsDragging, openZoneEditor, onZoneMouseMove, onZoneMouseLeave }) => {
  const nodeRef = useRef(null);
  const preset = ZONE_PRESETS[zone.zone_type] || ZONE_PRESETS['General'];
  const baseColor = zone.color || preset.color;

  return (
    <Draggable
      nodeRef={nodeRef}
      key={zone.id}
      bounds="parent"
      grid={[0.1 * PPM, 0.1 * PPM]}
      position={{ x: (zone.location_x || 0) * PPM, y: (zone.location_y || 0) * PPM }}
      onDrag={() => setIsDragging(true)}
      onStop={(e, data) => handleStop(e, data, zone, 'zone')}
    >
      <div
        ref={nodeRef}
        onMouseMove={(e) => onZoneMouseMove && onZoneMouseMove(e, zone)}
        onMouseLeave={() => onZoneMouseLeave && onZoneMouseLeave()}
        onClick={() => !isDragging && openZoneEditor(zone)}
        className="absolute border-2 flex items-start justify-start cursor-move hover:border-opacity-100 group"
        style={{
          width: `${(zone.width || 5) * PPM}px`,
          height: `${(zone.depth || 5) * PPM}px`,
          backgroundColor: `${baseColor}40`, // 40 = 25% opacity
          borderColor: baseColor,
          zIndex: 10
        }}
      >
        {Children.count(children) === 0 && (
          <span className="text-xs font-bold text-gray-700 select-none bg-white/50 px-1 rounded">{zone.zone_name}</span>
        )}
        

        {/* Resize Handles */}
        <div 
          onMouseDown={(e) => startResize(e, zone, 'zone', 'nw')}
          className="absolute top-0 left-0 w-4 h-4 bg-gray-400 cursor-nwse-resize hover:bg-gray-600 rounded-br-md opacity-0 group-hover:opacity-100 transition-opacity"
        ></div>
        <div 
          onMouseDown={(e) => startResize(e, zone, 'zone', 'ne')}
          className="absolute top-0 right-0 w-4 h-4 bg-gray-400 cursor-nesw-resize hover:bg-gray-600 rounded-bl-md opacity-0 group-hover:opacity-100 transition-opacity"
        ></div>
        <div 
          onMouseDown={(e) => startResize(e, zone, 'zone', 'sw')}
          className="absolute bottom-0 left-0 w-4 h-4 bg-gray-400 cursor-nesw-resize hover:bg-gray-600 rounded-tr-md opacity-0 group-hover:opacity-100 transition-opacity"
        ></div>
        <div 
          onMouseDown={(e) => startResize(e, zone, 'zone', 'se')}
          className="absolute bottom-0 right-0 w-4 h-4 bg-gray-400 cursor-nwse-resize hover:bg-gray-600 rounded-tl-md opacity-0 group-hover:opacity-100 transition-opacity"
        ></div>
        
        {/* Render Dimension Lines (Calculated from Relative Positions) */}
        {renderRowGaps(children, PPM)}

        {/* Render Children (Shelves) */}
        {children}
      </div>
    </Draggable>
  );
};

const DraggableShelf = ({ shelf, PPM, handleStop, setIsDragging, isDragging, setSelectedShelf, selectedShelf, suggestedItem }) => {
  const nodeRef = useRef(null);
  
  // Extract bay number (e.g., "B1") from shelf_code
  const shelfCode = shelf.shelf_code || shelf.name || "";
  const bayMatch = shelfCode.match(/-B(\d+)-/);
  const bayLabel = bayMatch ? `B${bayMatch[1]}` : shelfCode;

  return (
    <Draggable
      nodeRef={nodeRef}
      key={shelf.id}
      disabled={true}
      bounds="parent"
      grid={[0.1 * PPM, 0.1 * PPM]}
      position={{ x: shelf.relativeX, y: shelf.relativeY }}
      onDrag={() => setIsDragging(true)}
      onStop={(e, data) => handleStop(e, data, shelf, 'shelf')}
    >
        <div 
          ref={nodeRef}
          className={`absolute border-2 flex flex-col items-center justify-center cursor-move transition-shadow hover:shadow-lg rounded-sm
            ${selectedShelf?.id === shelf.id ? 'border-indigo-600 bg-indigo-50 z-20' : 'border-gray-400 bg-white z-10'}
            ${shelf.type === 'Bulk Floor Space' ? 'bg-amber-100 border-amber-400' : ''}
            ${shelf.type === 'Cold Locker' ? 'bg-cyan-100 border-cyan-400' : ''}
            ${suggestedItem && suggestedItem.status === 'placed' ? 'bg-emerald-100 border-emerald-500' : suggestedItem ? 'bg-yellow-100 border-yellow-500 animate-pulse' : ''}
          `}
          style={{
             width: `${shelf.width * PPM}px`,
             height: `${shelf.depth * PPM}px`
          }}
          title={shelf.shelf_code || shelf.name}
        >
          <div className="flex flex-col items-center justify-center h-full pointer-events-none p-1">
             <span className="text-[9px] font-bold text-gray-800">{bayLabel}</span>
             {suggestedItem && suggestedItem.status !== 'placed' && (
               <div className="flex flex-col items-center">
                 <span className="text-[7px] font-bold text-amber-700">PENDING</span>
                 {suggestedItem.skus?.length > 0 && (
                   <span className="text-[6px] text-amber-900 leading-tight text-center truncate w-full">
                     {suggestedItem.skus[0]}
                   </span>
                 )}
               </div>
             )}
          </div>
        </div>
    </Draggable>
  );
};

// Helper to render gap dimension lines between rows
const renderRowGaps = (children, PPM) => {
    const shelves = Children.map(children, c => {
        if (!c || !c.props || !c.props.shelf) return null;
        return {
            ...c.props.shelf,
            x: c.props.shelf.relativeX / PPM, 
            y: c.props.shelf.relativeY / PPM,
            w: c.props.shelf.width,
            h: c.props.shelf.depth 
        };
    })?.filter(Boolean);

    if (!shelves || shelves.length < 2) return null;

    // 1. Cluster shelves into Rows based on Y overlap
    // Sort by Y first
    shelves.sort((a, b) => a.y - b.y);

    const rows = [];
    let currentRow = [shelves[0]];

    for (let i = 1; i < shelves.length; i++) {
        const s = shelves[i];
        const prev = currentRow[currentRow.length - 1];
        
        // If overlap in Y (center is within previous shelf's Y-range)
        const center = s.y + s.h / 2;
        const prevBottom = prev.y + prev.h;
        // Simple tolerance: if top of S is less than Bottom of Prev + modest gap? 
        // Better: Row clustering. If Top(S) < Bottom(Prev) - overlap, they are same row.
        // But for distinct rows, Top(S) > Bottom(Prev).
        
        // We use a tolerance. If gap is effectively zero or negative, same row.
        if (s.y < prev.y + prev.h - 0.1) {
             currentRow.push(s);
             // Update row metric (max Y) - simple grouping
        } else {
             rows.push(currentRow);
             currentRow = [s];
        }
    }
    rows.push(currentRow);

    if (rows.length < 2) return null;

    const lines = [];
    
    // 2. Calculate Bounds for each Row
    const rowBounds = rows.map(row => {
        const ys = row.map(s => s.y);
        const xs = row.map(s => s.x);
        const maxYs = row.map(s => s.y + s.h);
        const maxXs = row.map(s => s.x + s.w);
        
        return {
            minY: Math.min(...ys),
            maxY: Math.max(...maxYs),
            minX: Math.min(...xs),
            maxX: Math.max(...maxXs)
        };
    });

    // 3. Draw gaps between rows
    for (let i = 0; i < rowBounds.length - 1; i++) {
        const curr = rowBounds[i];
        const next = rowBounds[i+1];
        
        // Check if they are roughly vertically aligned (same column)
        // If not, they might be side-by-side, which requires different logic.
        // For standard "Bulk Generator" output, they are usually one after another in Y.
        
        let gap = next.minY - curr.maxY;
        
        // Only show if gap is large enough to be an Aisle (e.g. > 1.0m)
        // Back-to-back gaps (flue space) are usually 0.1-0.3m.
        if (gap > 1.0) {
             const startX = Math.min(curr.minX, next.minX);
             const endX = Math.max(curr.maxX, next.maxX);
             const width = endX - startX;
             
             // Smart Labeling:
             // If shelves have 'aisle_num', we assume Face-to-Face share the same Aisle Number.
             // If they are Back-to-Back, they likely have different Aisle Numbers.
             
             const nextAisle = next.aisle_num || (rows[i+1][0] ? rows[i+1][0].aisle_num : null);
             const currAisle = curr.aisle_num || (rows[i][0] ? rows[i][0].aisle_num : null);
             
             // Logic:
             // 1. If both exist and differ -> likely boundary between aisles (Back-to-Back), but gap > 1.0 implies large separation? 
             //    Actually, if gap > 1.0, it MUST be an aisle.
             //    But user said: "label show only between A1... or face to face".
             //    Maybe they mean if A1 is above and A2 is below, don't show label? 
             //    But back-to-back usually has negligible gap.
             
             // Let's rely primarily on Gap Size (> 1.0m).
             // And if we have aisle numbers:
             // - If curr == next -> "Aisle {curr}"
             // - If curr != next -> "Gap {curr}/{next}"? Or just no label?
             // User said: "not show in back to back". Back-to-back usually has different aisle numbers (e.g. Rack 1-Left(A1) vs Rack 2-Right(A2)).
             // But back-to-back usually has small gap.
             
             // If the gap is > 1.0m, it's definitely a walkway/aisle.
             // We will label it.
             // Which aisle number to pick?
             // If Aisle 1 shelves face Aisle 1 shelves -> currAisle == nextAisle => "Aisle {currAisle}"
             // If we just have raw shelves without aisle data -> determine by gap size only.
             
             let labelText = '';
             if (currAisle && nextAisle && currAisle === nextAisle) {
                 labelText = `Aisle ${currAisle}`;
             } else if (currAisle) {
                 labelText = `Aisle ${currAisle}`;
             } else if (nextAisle) {
                 labelText = `Aisle ${nextAisle}`;
             }

             const dynamicFontSize = Math.max(8, Math.min(14, (PPM / 30) * 9.5));

             lines.push(
               <div key={`gap-${i}`} className="absolute pointer-events-none flex items-center justify-center gap-1" 
                    style={{ 
                        top: `${curr.maxY * PPM}px`, 
                        height: `${gap * PPM}px`, 
                        left: `${startX * PPM}px`, 
                        width: `${width * PPM}px`,
                        zIndex: 5
                    }}>
                    {/* Dashed Line */}
                    <div className="absolute h-full border-l border-indigo-400 border-dashed left-1/2 -ml-[1px] opacity-50"></div>
                    
                    {/* Label Group */}
                    <div className="relative z-10 flex items-center gap-1 bg-white/90 px-1.5 py-0.5 border border-indigo-200 rounded shadow-sm">
                        {labelText && (
                            <span 
                                className="text-gray-600 font-semibold border-r border-gray-300 pr-1 mr-1"
                                style={{ fontSize: `${dynamicFontSize}px` }}
                            >
                                {labelText}
                            </span>
                        )}
                        <span 
                            className="text-indigo-700 font-bold"
                            style={{ fontSize: `${dynamicFontSize}px` }}
                        >
                            {gap.toFixed(2)}m
                        </span>
                    </div>
               </div>
             );
        }
    }

    return lines;
};

const DraggableArea = ({ floorId, area, index, PPM, handleStop, setIsDragging, onSelect, removeArea, startResize }) => {
    const nodeRef = useRef(null);
    const width = (area.width || 2) * PPM;
    const depth = (area.depth || 2) * PPM;
    const isPassable = area.is_passable ?? true;

    // Green for passable areas, Red for obstacles
    const bgColor = isPassable ? 'bg-emerald-500/40' : 'bg-rose-500/80';
    const borderColor = isPassable ? 'border-emerald-600' : 'border-rose-700';
    // Areas should be clickable even when overlapping zones (Zones are z-10)
    // Passable areas go above zones (z-20), obstacles stay on top (z-40)
    const zIndex = isPassable ? 'z-20' : 'z-40';

    return (
        <Draggable
            nodeRef={nodeRef}
            bounds="parent"
            grid={[0.1 * PPM, 0.1 * PPM]}
            position={{ x: (area.location_x || 0) * PPM, y: (area.location_y || 0) * PPM }}
            onDrag={() => setIsDragging(true)}
            onStop={(e, data) => handleStop(e, data, { floorId, index }, 'area')}
        >
            <div 
                ref={nodeRef}
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
                className={`absolute ${bgColor} border-2 ${borderColor} text-white flex items-center justify-center cursor-move shadow-md ${zIndex} rounded-sm hover:border-white group transition-colors`}
                style={{ width: `${width}px`, height: `${depth}px` }}
            >
                <div className="text-center leading-tight">
                    <span className="text-[10px] font-bold pointer-events-none select-none block uppercase drop-shadow-md">{area.area_name || 'AREA'}</span>
                    <span className="text-[8px] opacity-90 pointer-events-none select-none block drop-shadow-sm font-medium">
                        {area.usage_category?.replace('_', ' ') || 'GENERAL'}
                    </span>
                    <span className="text-[8px] opacity-70 pointer-events-none select-none block">
                        {(width/PPM).toFixed(1)}x{(depth/PPM).toFixed(1)}m
                    </span>
                </div>


                {/* Resize Handles */}
                <div 
                    className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize bg-white/20 hover:bg-white/50 rounded-br-sm transition-colors"
                    onMouseDown={(e) => startResize(e, { ...area, floorId, index }, 'area', 'nw')}
                />
                <div 
                    className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize bg-white/20 hover:bg-white/50 rounded-bl-sm transition-colors"
                    onMouseDown={(e) => startResize(e, { ...area, floorId, index }, 'area', 'ne')}
                />
                <div 
                    className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize bg-white/20 hover:bg-white/50 rounded-tr-sm transition-colors"
                    onMouseDown={(e) => startResize(e, { ...area, floorId, index }, 'area', 'sw')}
                />
                <div 
                    className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize bg-white/20 hover:bg-white/50 rounded-tl-sm transition-colors"
                    onMouseDown={(e) => startResize(e, { ...area, floorId, index }, 'area', 'se')}
                />
            </div>
        </Draggable>
    );
};

function WarehouseContent() {
  const { user, loading } = useAuth();
  const [focusedZoneId, setFocusedZoneId] = useState(null);
  const [viewResetId, setViewResetId] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const [viewMode, setViewMode] = useState('2d'); // '2d' | '3d'
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1); // 1.0 = Default (30 PPM)
  const [fitZoom, setFitZoom] = useState(1);
  const { state, setState, fetchWarehouses, findNextAvailablePosition, updateShelfPosition, updateAreaPosition, updateAreaDimensions, updateAreaLabel, updateAreaProperty, updateZonePosition, updateZoneDimensions, removeZone, addArea, removeArea, addZone, saveBulkShelves, updateZone } = useWms();
  const [selectedArea, setSelectedArea] = useState(false);
  const [currentFloorId, setCurrentFloorId] = useState(null);

  useEffect(() => {
    // When warehouses or user loads, find the default floor (Floor 0)
    if (state.warehouses?.length > 0 && user?.warehouse_id && !currentFloorId) {
      const myWh = state.warehouses.find(wh => wh.id === user.warehouse_id);
      if (myWh?.floors?.length > 0) {
        // Priority 1: floor_number 0, Priority 2: first available floor
        const floorZero = myWh.floors.find(f => f.floor_number === 0) || myWh.floors[0];
        if (floorZero) {
          setCurrentFloorId(floorZero.id);
        }
      }
    }
  }, [state.warehouses, user, currentFloorId]); 
  const [isDragging, setIsDragging] = useState(false);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [newZoneData, setNewZoneData] = useState({ name: '', type: 'General' });
  const [zoneEditor, setZoneEditor] = useState(null);
  const resizingRef = useRef(null);
  const searchParams = useSearchParams();
  const editMode = searchParams.get('edit') === '1';
  const stableUnits = (s) => {
    if (!s) return 0;
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return (h % 50) + 1;
  };
  
  const canvasRef = useRef(null);
  const [zoneHover, setZoneHover] = useState({ show: false, x: 0, y: 0, name: '', label: null });

  // PENDING PLACEMENT VOLUMES LOGIC
  const [pendingPlacements, setPendingPlacements] = useState([]);
  
  // Need current warehouse ID to fetch right placements
  const currentWarehouseId = user?.warehouse_id;

  useEffect(() => {
    const fetchPending = async () => {
      if (!currentWarehouseId) return;
      try {
        const res = await fetch(`http://localhost:8000/receiving/pending-placements?warehouse_id=${currentWarehouseId}`);
        if (res.ok) {
          const data = await res.json();
          setPendingPlacements(data);
        }
      } catch (e) {
        console.error("Failed to fetch pending placements", e);
      }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 10000); // Polling every 10s
    return () => clearInterval(interval);
  }, [currentWarehouseId]);

  const suggestedItems = useMemo(() => {
    const items = {};
    pendingPlacements.forEach(item => {
      if (!item.shelf_id) return;
      const id = item.shelf_id;
      if (!items[id]) {
        items[id] = {
          total_volume: 0,
          boxes: [],
          skus: [],
          status: 'placed' // Default to placed, then downgrade if any is suggested
        };
      }
      items[id].total_volume += parseFloat(item.total_volume || 0);
      
      // If any item on the shelf is still suggested/pending, the whole shelf is "suggested" (yellow)
      if (item.status === 'suggested' || item.status === 'pending') {
        items[id].status = 'suggested';
      }

      const bw = parseFloat(item.measured_width || 0);
      const bd = parseFloat(item.measured_depth || 0);
      const bh = parseFloat(item.measured_height || 0);
      if (bw > 0 && bd > 0 && bh > 0) {
        items[id].boxes.push({
          bw, bd, bh, sku: item.sku, status: item.status
        });
      }

      if (item.sku && !items[id].skus.includes(item.sku)) {
        items[id].skus.push(item.sku);
      }
    });
    return items;
  }, [pendingPlacements]);

  const handleZoneMouseMove = (e, zone) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;
    const presetLabel = ZONE_PRESETS[zone.zone_type]?.label || zone.zone_type || '';
    setZoneHover({ show: true, x, y, name: zone.zone_name || '', label: presetLabel });
  };
  const clearZoneHover = () => setZoneHover(prev => ({ ...prev, show: false }));

  // If not configured or explicitly editing, show Wizard
  // We show the wizard if the current user doesn't have a warehouse_id associated with them.
  const userHasWarehouse = user?.warehouse_id;

  if (!user || !userHasWarehouse || (editMode && userHasWarehouse)) {
     if (!user) return null; // Wait for redirect
     return <WarehouseWizard 
        isUpdate={editMode && userHasWarehouse}
        warehouseId={user?.warehouse_id}
        onClose={() => {
          if (userHasWarehouse) router.push('/manager/warehouse');
          else router.push('/manager');
        }} 
     />;
  }
  // Filter shelves for 2D view based on current floor
  const currentFloorZones = state.zones.filter(z => z.floor_id === currentFloorId);
  const floorZones = currentFloorZones.map(z => z.id);
  const filteredShelves = state.shelves.filter(s => floorZones.includes(s.zone_id));
  const currentFloor = state.floors.find(f => f.id === currentFloorId);

  // Scaling Factor (Pixels per Meter)
  const BASE_PPM = 30;
  const PPM = BASE_PPM * zoomLevel;

  // Auto-fit zoom: fit the warehouse into the viewport on initial load
  useEffect(() => {
    const wM = state.warehouseDims?.widthM;
    const dM = state.warehouseDims?.depthM;
    if (!wM || !dM) return;
    const containerW = (canvasRef.current?.clientWidth || window.innerWidth) - 48;
    const containerH = window.innerHeight * 0.65;
    const fitW = containerW / (wM * BASE_PPM);
    const fitH = containerH / (dM * BASE_PPM);
    const fit = Math.min(fitW, fitH, 1);
    const rounded = Math.max(0.25, parseFloat(fit.toFixed(2)));
    setFitZoom(rounded);
    setZoomLevel(rounded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.warehouseDims?.widthM, state.warehouseDims?.depthM]);

  const handleZoom = (delta) => {
    setZoomLevel(prev => Math.min(Math.max(0.2, prev + delta), 3));
  };

  const resetZoom = () => setZoomLevel(fitZoom);


  const startResize = (e, item, type = 'zone', corner = 'se') => {
    e.stopPropagation();
    resizingRef.current = {
      type,
      corner,
      id: type === 'zone' ? item.id : null,
      floorId: type === 'area' ? item.floorId : null,
      areaIndex: type === 'area' ? item.index : null,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: (item.width || 0) * PPM,
      startHeight: (item.depth || 0) * PPM,
      itemStartX: (item.location_x || 0) * PPM,
      itemStartY: (item.location_y || 0) * PPM
    };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', stopResize);
  };

  const checkOverlap = (r1, r2) => {
    return !(r1.x + r1.w <= r2.x || 
             r1.x >= r2.x + r2.w || 
             r1.y + r1.h <= r2.y || 
             r1.y >= r2.y + r2.h);
  };

  

  const handleResizeMove = (e) => {
    if (!resizingRef.current) return;
    const { type, corner, id, floorId, areaIndex, startX, startY, startWidth, startHeight, itemStartX, itemStartY } = resizingRef.current;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    let newPixelWidth = startWidth;
    let newPixelHeight = startHeight;
    let newPixelX = itemStartX;
    let newPixelY = itemStartY;

    if (corner === 'se') {
        newPixelWidth = Math.max(50, startWidth + deltaX);
        newPixelHeight = Math.max(50, startHeight + deltaY);
    } else if (corner === 'sw') {
        newPixelWidth = Math.max(50, startWidth - deltaX);
        newPixelHeight = Math.max(50, startHeight + deltaY);
        if (startWidth - deltaX > 50) newPixelX = itemStartX + deltaX;
    } else if (corner === 'ne') {
        newPixelWidth = Math.max(50, startWidth + deltaX);
        newPixelHeight = Math.max(50, startHeight - deltaY);
        if (startHeight - deltaY > 50) newPixelY = itemStartY + deltaY;
    } else if (corner === 'nw') {
        newPixelWidth = Math.max(50, startWidth - deltaX);
        newPixelHeight = Math.max(50, startHeight - deltaY);
        if (startWidth - deltaX > 50) newPixelX = itemStartX + deltaX;
        if (startHeight - deltaY > 50) newPixelY = itemStartY + deltaY;
    }

    const snap = 0.1 * PPM;
    const snappedWidth = Math.round(newPixelWidth / snap) * snap;
    const snappedHeight = Math.round(newPixelHeight / snap) * snap;
    const snappedX = Math.round(newPixelX / snap) * snap;
    const snappedY = Math.round(newPixelY / snap) * snap;

    if (type === 'zone') {
        // Check Area Collision during resize
        const floor = state.floors.find(f => f.id === currentFloorId);
        if (floor) {
            // Current Zone Position (static during resize)
            const zone = state.zones.find(z => z.id === id);
            if (zone && Array.isArray(floor.areas)) {
                const resizingRect = { 
                    x: snappedX / PPM, 
                    y: snappedY / PPM, 
                    w: snappedWidth / PPM, 
                    h: snappedHeight / PPM 
                };
                
                const overlappingArea = floor.areas.find(area => {
                    // If the area is passable, we allow zones to overlap it
                    if (area.is_passable) return false;

                    const areaRect = {
                        x: area.location_x,
                        y: area.location_y,
                        w: area.width || 2,
                        h: area.depth || 2
                    };
                    return checkOverlap(resizingRect, areaRect);
                });
                
                if (overlappingArea) {
                    // Ignore this resize step if it overlaps
                    return;
                }
            }
        }
        updateZoneDimensions(id, snappedWidth / PPM, snappedHeight / PPM, snappedX / PPM, snappedY / PPM);
    } else if (type === 'area') {
         const floor = state.floors.find(f => f.id === floorId);
         const area = floor?.areas?.[areaIndex];
         
         // Prevent Red Area from overlapping with Zones during resize
         if (area && !area.is_passable) {
            const resizingRect = { 
                x: snappedX / PPM, 
                y: snappedY / PPM, 
                w: snappedWidth / PPM, 
                h: snappedHeight / PPM 
            };
            
            const overlappingZone = state.zones.filter(z => z.floor_id === floorId).find(zone => {
                const zoneRect = { x: zone.location_x, y: zone.location_y, w: zone.width, h: zone.depth };
                return checkOverlap(resizingRect, zoneRect);
            });
            
            if (overlappingZone) return; // Prevent resize if it hits a zone
         }

         const currentHeight = area?.height || 3.0;
         updateAreaDimensions(floorId, areaIndex, snappedWidth / PPM, snappedHeight / PPM, currentHeight, snappedX / PPM, snappedY / PPM);
     }
  };

  const stopResize = () => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', stopResize);
  };

  const openZoneEditor = (zone) => {
    setZoneEditor({
      id: zone.id,
      name: zone.zone_name || '',
      type: zone.zone_type || 'General',
      color: zone.color || '#e5e7eb',
      width: zone.width || 10,
      depth: zone.depth || 8
    });
  };

  const applyZoneEdit = async () => {
    if (!zoneEditor) return;
    const { id, width, depth, name, type, color } = zoneEditor;
    
    // 1. Update local state for all fields
    setState(prev => ({
      ...prev,
      zones: prev.zones.map(z => 
        z.id === id ? { ...z, zone_name: name, zone_type: type, width: parseFloat(width) || z.width, depth: parseFloat(depth) || z.depth, color } : z
      )
    }));

    // 2. Persist to server
    await updateZone(id, { 
      zone_name: name, 
      zone_type: type, 
      width: parseFloat(width) || 1, 
      depth: parseFloat(depth) || 1 
    });

    setZoneEditor(null);
  };

  const rotateZoneElements = async (zoneId, angleDegrees) => {
    const zone = state.zones.find(z => z.id === zoneId);
    if (!zone) return;
    
    // Zone geometric center
    const cx = zone.location_x + zone.width / 2;
    const cy = zone.location_y + zone.depth / 2;
    
    const angleRad = (angleDegrees * Math.PI) / 180;
    const cosA = Math.round(Math.cos(angleRad)); // Round to avoid float issues with 90 degs
    const sinA = Math.round(Math.sin(angleRad));

    const zoneShelves = state.shelves.filter(s => s.zone_id === zoneId);
    
    // 1. Calculate new sizes and top-lefts if rotating 90 or 270 degrees
    let newZoneW = zone.width;
    let newZoneD = zone.depth;
    let newZoneX = zone.location_x;
    let newZoneY = zone.location_y;
    
    if (Math.abs(angleDegrees) % 180 !== 0) {
      newZoneW = zone.depth;
      newZoneD = zone.width;
      // Re-center around same center
      newZoneX = cx - newZoneW / 2;
      newZoneY = cy - newZoneD / 2;
    }
    
    // 2. Transformed Shelves
    const updatedShelves = zoneShelves.map(s => {
      // Shelf center
      const sx = s.location_x + (s.width / 2);
      const sy = s.location_y + (s.depth / 2);
      
      // Relative offset from zone center
      const dx = sx - cx;
      const dy = sy - cy;
      
      // Rotate center
      const newDx = dx * cosA - dy * sinA;
      const newDy = dx * sinA + dy * cosA;
      
      const newSx = cx + newDx;
      const newSy = cy + newDy;
      
      // Base rotation update
      let newRot = (s.orientation_angle || 0) + angleDegrees;
      newRot = ((newRot % 360) + 360) % 360; // Normalize 0-359
      
      let newW = s.width;
      let newD = s.depth;
      if (Math.abs(angleDegrees) % 180 !== 0) {
          newW = s.depth;
          newD = s.width;
      }

      return {
        ...s,
        width: newW,
        depth: newD,
        location_x: newSx - newW / 2,
        location_y: newSy - newD / 2,
        orientation_angle: newRot
      };
    });

    // 3. Update Local State & Persist
    setState(prev => {
        const otherShelves = prev.shelves.filter(s => s.zone_id !== zoneId);
        const otherZones = prev.zones.filter(z => z.id !== zoneId);
        
        return {
            ...prev,
            zones: [...otherZones, { ...zone, width: newZoneW, depth: newZoneD, location_x: newZoneX, location_y: newZoneY}],
            shelves: [...otherShelves, ...updatedShelves]
        };
    });
    
    // Quick local update to UI
    if (zoneEditor && zoneEditor.id === zoneId) {
        setZoneEditor(prev => ({...prev, width: newZoneW, depth: newZoneD}));
    }

    try {
        await updateZone(zoneId, { width: newZoneW, depth: newZoneD, location_x: newZoneX, location_y: newZoneY });
        await saveBulkShelves(zoneId, updatedShelves);
    } catch(e) {
        console.error("Failed to persist rotation", e);
    }
  };

  const flipZoneElements = async (zoneId, axis) => {
    const zone = state.zones.find(z => z.id === zoneId);
    if (!zone) return;

    // Zone geometric center
    const cx = zone.location_x + zone.width / 2;
    const cy = zone.location_y + zone.depth / 2;
    
    const zoneShelves = state.shelves.filter(s => s.zone_id === zoneId);

    const updatedShelves = zoneShelves.map(s => {
      const sx = s.location_x + (s.width / 2);
      const sy = s.location_y + (s.depth / 2);
      
      let newSx = sx;
      let newSy = sy;
      let newRot = s.orientation_angle || 0;

      if (axis === 'horizontal') {
        // Flip over vertical line (X-axis reflection)
         const dx = sx - cx;
         newSx = cx - dx;
         newRot = (-newRot) % 360;
      } else {
        // Flip over horizontal line (Y-axis reflection)
         const dy = sy - cy;
         newSy = cy - dy;
         newRot = (180 - newRot) % 360;
      }
      
      newRot = ((newRot % 360) + 360) % 360; // Normalize
      
      return {
        ...s,
        location_x: newSx - s.width / 2,
        location_y: newSy - s.depth / 2,
        orientation_angle: newRot
      };
    });

    setState(prev => {
        const otherShelves = prev.shelves.filter(s => s.zone_id !== zoneId);
        return {
            ...prev,
            shelves: [...otherShelves, ...updatedShelves]
        };
    });

    try {
        await saveBulkShelves(zoneId, updatedShelves);
    } catch(e) {
        console.error("Failed to persist flip", e);
    }
  };

  const handleStop = (e, data, item, type) => {
    // Snap to grid (0.1m)
    const snap = 0.1 * PPM;
    const rawX = data.x;
    const rawY = data.y;
    
    let snappedX = Math.round(rawX / snap) * snap;
    let snappedY = Math.round(rawY / snap) * snap;

    // Convert back to meters
    const meterX = snappedX / PPM;
    const meterY = snappedY / PPM;

    if (type === 'shelf') {
        updateShelfPosition(item.id, meterX, meterY);
    } else if (type === 'area') {
        const { floorId, index } = item || {};
        const floor = state.floors.find(f => f.id === (floorId || currentFloorId));
        const area = floor?.areas?.[index];
        
        // Prevent Red Area from overlapping with Zones
        if (area && !area.is_passable) {
            const areaRect = { x: meterX, y: meterY, w: area.width || 2, h: area.depth || 2 };
            const overlappingZone = state.zones.filter(z => z.floor_id === (floorId || currentFloorId)).find(zone => {
                const zoneRect = { x: zone.location_x, y: zone.location_y, w: zone.width, h: zone.depth };
                return checkOverlap(areaRect, zoneRect);
            });
            
            if (overlappingZone) {
                alert(`Cannot place Obstacle Area over ${overlappingZone.zone_name || 'Zone'}!`);
                setTimeout(() => setIsDragging(false), 100);
                return;
            }
        }
        
        updateAreaPosition(floorId || currentFloorId, typeof index === 'number' ? index : 0, meterX, meterY);
    } else if (type === 'zone') {
        // Check Area Collision
        const floor = state.floors.find(f => f.id === currentFloorId);
        if (floor && Array.isArray(floor.areas)) { 
             const newZoneRect = { 
                 x: meterX, 
                 y: meterY, 
                 w: item.width, 
                 h: item.depth 
             };

             const overlappingArea = floor.areas.find(area => {
                 // If the area is passable, we allow zones to overlap it
                 if (area.is_passable) return false;

                 const areaRect = {
                     x: area.location_x,
                     y: area.location_y,
                     w: area.width || 2,
                     h: area.depth || 2
                 };
                 return checkOverlap(newZoneRect, areaRect);
             });

             if (overlappingArea) {
                 alert(`Cannot place Zone over ${overlappingArea.area_name || 'Area'}!`);
                 return; // Prevent update
             }
        }

        updateZonePosition(item.id, meterX, meterY);
    }
    
    setTimeout(() => setIsDragging(false), 100);
  };

  const handleAddZoneClick = () => {
      setNewZoneData({
          name: `Zone ${String.fromCharCode(65 + currentFloorZones.length)}`,
          type: 'General'
      });
      setIsZoneModalOpen(true);
  };

  const handleConfirmAddZone = async () => {
    if (!newZoneData.name) {
        alert("Zone Name is required");
        return;
    }

    const preset = ZONE_PRESETS[newZoneData.type] || ZONE_PRESETS['General'];
    const pos = findNextAvailablePosition(10, 8, currentFloorId, 'zone');

    const zoneData = {
      zone_name: newZoneData.name,
      zone_type: newZoneData.type,
      color: preset.color,
      width: 10,
      depth: 8,
      location_x: pos.x,
      location_y: pos.y,
      shelves: []
    };

    const success = await addZone(currentFloorId, zoneData);
    if (success) {
      setIsZoneModalOpen(false);
    } else {
      alert("Failed to create zone on server.");
    }
  };

  const handleAddShelf = () => {
    // 1. Find a zone for this floor (default to first one)
    const zone = state.zones.find(z => z.floor_id === currentFloorId);
    if (!zone) {
        alert("No zones on this floor. Please create a zone first.");
        return;
    }

    // 2. Smart Spawn: Find empty spot
    const width = 1.5;
    const depth = 1.2;
    const { x, y } = findNextAvailablePosition(width, depth, currentFloorId);

    // 3. Create Shelf
    const newShelf = {
        id: Date.now(),
        zone_id: zone.id,
        shelf_code: `NEW-${Date.now().toString().slice(-4)}`,
        level_code: 'L1',
        name: `NEW-${Date.now().toString().slice(-4)}`,
        location_x: x,
        location_y: y,
        location_z: 0,
        width: width,
        height: 0.8,
        depth: depth,
        type: 'Standard Rack',
        occupancy: 0,
        levels: 1,
        products: [],
        maxWeight: 1000,
        currentWeight: 0
    };

    setState(prev => ({
        ...prev,
        shelves: [...prev.shelves, newShelf]
    }));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 bg-background shadow-sm border-b border-border z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Visual Designer</h1>
          <p className="text-gray-500 text-sm">Drag and drop to configure Floor {currentFloorId}.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Add Zone Button */}
          {viewMode === '2d' && (
              <Button 
                onClick={handleAddZoneClick}
                className="flex items-center gap-2"
              >
                <Layers size={18} /> Add Zone
              </Button>
          )}

          {viewMode === '2d' && (
              <Button 
                onClick={() => addArea(currentFloorId, 'New Area')}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <Plus size={18} /> Add Area
              </Button>
          )}

          {/* Add Shelf is available in Shelves Layout (Data Entry) page, not here */}

          {/* Floor Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                {currentFloor ? (currentFloor.name || `Floor ${currentFloor.floor_number}`) : 'Select Floor'} <ChevronDown size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {state.warehouses.map(wh => {
                if (wh.id === user?.warehouse_id) {
                  return wh.floors.map(floor => (
                    <DropdownMenuItem key={floor.id} onClick={() => setCurrentFloorId(floor.id)}>
                      {floor.name || `Floor ${floor.floor_number}`}
                    </DropdownMenuItem>
                  ));
                }
                return null;
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Toggle Switch */}
          <div className="bg-background p-1 rounded-lg border border-border flex items-center shadow-sm">
            {viewMode === '2d' && (
              <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-500 hover:text-gray-900"
                  onClick={() => handleZoom(-0.1)}
                  title="Zoom Out"
                >
                  <ZoomOut size={16} />
                </Button>
                <div className="text-[10px] font-mono w-10 text-center text-gray-400">
                  {Math.round(zoomLevel * 100)}%
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-500 hover:text-gray-900"
                  onClick={() => handleZoom(0.1)}
                  title="Zoom In"
                >
                  <ZoomIn size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-500 hover:text-gray-900 ml-1"
                  onClick={resetZoom}
                  title="Reset Zoom"
                >
                  <RotateCcw size={14} />
                </Button>
              </div>
            )}
            <Button
              onClick={() => setViewMode('2d')}
              variant={viewMode === '2d' ? 'secondary' : 'ghost'}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === '2d' 
                  ? 'shadow-sm' 
                  : ''
              }`}
            >
              Shelves Layout
            </Button>
            <Button
              onClick={() => setViewMode('3d')}
              variant={viewMode === '3d' ? 'secondary' : 'ghost'}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === '3d' 
                  ? 'shadow-sm' 
                  : ''
              }`}
            >
              3D View
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 relative min-h-0 min-w-0">
        {/* Main Viewport */}
        <div className="flex-1 min-w-0 min-h-0 bg-white rounded-xl shadow-inner border border-gray-200 relative flex flex-col">
            
           <div className="relative z-10 flex-1 bg-slate-50 overflow-auto min-h-0 min-w-0">
             {viewMode === '2d' ? (
               <div 
                 className="relative bg-white shadow-sm mx-auto mt-10 border border-gray-300"
                 ref={canvasRef}
                 style={{
                    width: `${state.warehouseDims.widthM * PPM}px`,
                    height: `${state.warehouseDims.depthM * PPM}px`,
                    backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)',
                    backgroundSize: `${1 * PPM}px ${1* PPM}px` // 1m grid
                 }}
               >
                 {/* Canvas Label */}
                 <div className="absolute -top-7 left-0 bg-white/80 px-2 py-0.5 rounded border border-gray-200 text-[10px] text-gray-500 font-bold z-30 shadow-sm">
                    Warehouse: {(state.warehouseDims.widthM || 0).toFixed(1)}m x {(state.warehouseDims.depthM || 0).toFixed(1)}m
                 </div>

                 {/* Zones with Nested Shelves */}
                 {currentFloorZones.map((zone) => (
                   <DraggableZone
                     key={zone.id}
                     zone={zone}
                     PPM={PPM}
                     handleStop={handleStop}
                     startResize={startResize}
                     removeZone={removeZone}
                     isDragging={isDragging}
                     setIsDragging={setIsDragging}
                     openZoneEditor={openZoneEditor}
                     onZoneMouseMove={handleZoneMouseMove}
                     onZoneMouseLeave={clearZoneHover}
                   >
                     {filteredShelves
                       .filter(s => s.zone_id === zone.id)
                       .map(shelf => (
                         <DraggableShelf
                           key={shelf.id}
                           shelf={{
                              ...shelf,
                              relativeX: (shelf.location_x - zone.location_x) * PPM,
                              relativeY: (shelf.location_y - zone.location_y) * PPM
                          }}
                           PPM={PPM}
                           handleStop={handleStop}
                           setIsDragging={setIsDragging}
                           isDragging={isDragging}
                           setSelectedShelf={setSelectedShelf}
                           selectedShelf={selectedShelf}
                            suggestedItem={suggestedItems[shelf.id]}
                         />
                       ))
                     }
                   </DraggableZone>
                 ))}

                 {zoneHover.show && (
                   <div
                     className="absolute z-50 bg-white px-2 py-1 rounded shadow border text-xs text-gray-700 pointer-events-none"
                     style={{ left: zoneHover.x + 12, top: zoneHover.y + 12 }}
                   >
                     <div className="font-semibold">{zoneHover.name}</div>
                     {zoneHover.label && <div className="opacity-70">{zoneHover.label}</div>}
                   </div>
                 )}

                 {/* Shelves loop removed (merged into zones) */}

                 {/* Areas (Synced) */}
                 {currentFloor && Array.isArray(currentFloor.areas) && currentFloor.areas.map((area, idx) => (
                    <DraggableArea
                        key={area.id || idx}
                        floorId={currentFloor.id}
                        area={area}
                        index={idx}
                        PPM={PPM}
                        handleStop={handleStop}
                        setIsDragging={setIsDragging}
                        onSelect={() => { setSelectedShelf(null); setSelectedArea(idx); }}
                        removeArea={removeArea}
                        startResize={startResize}
                    />
                 ))}

               </div>
             ) : (
               <div className="w-full h-full rounded-xl overflow-hidden bg-slate-900 relative">
                  <ShelfScene 
                    selectedShelfId={selectedShelf?.id} 
                    floorId={currentFloorId} 
                    focusedZoneId={focusedZoneId} 
                    resetTrigger={viewResetId}
                    suggestedItems={suggestedItems}
                  />

                  {/* 3D Focus Controls */}
                  <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                    <div className="bg-white/90 backdrop-blur shadow-md rounded-lg p-1 flex items-center gap-2 border border-gray-200">
                      <div className="pl-3 pr-1 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Focus Zone</div>
                      <select 
                        value={focusedZoneId || ""}
                        onChange={(e) => setFocusedZoneId(e.target.value || null)}
                        className="bg-transparent border-none text-sm font-semibold text-gray-700 focus:ring-0 cursor-pointer pr-8"
                      >
                        <option value="">All Zones</option>
                        {currentFloorZones.map(z => (
                          <option key={z.id} value={z.id}>{z.zone_name}</option>
                        ))}
                      </select>
                      <div className="h-6 w-[1px] bg-gray-200 mx-1"></div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setFocusedZoneId(null);
                          setViewResetId(prev => prev + 1);
                        }}
                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-bold text-xs h-8 px-3"
                      >
                        <Maximize2 size={14} className="mr-1.5" /> Reset View
                      </Button>
                    </div>
                  </div>

                  {/* Interaction Instructions */}
                  <div className="absolute bottom-4 right-4 z-20">
                    <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-gray-100 text-[11px] text-gray-600 space-y-2 min-w-[180px]">
                      <div className="flex items-center justify-between pb-2 border-b border-gray-100/50 mb-1">
                        <span className="font-bold text-gray-800 uppercase tracking-tight text-[10px]">Controls</span>
                        <MousePointer2 size={12} className="text-indigo-500" />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="opacity-70">Rotate View</span>
                        <span className="font-bold text-indigo-600 px-1.5 py-0.5 rounded">Left Click + Drag</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="opacity-70">Pan (Scroll)</span>
                        <span className="font-bold text-indigo-600  px-1.5 py-0.5 rounded">Right Click + Drag</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="opacity-70">Zoom In/Out</span>
                        <span className="font-bold text-indigo-600  px-1.5 py-0.5 rounded">Mouse Wheel</span>
                      </div>
                    </div>
                  </div>
               </div>
             )}
          </div>
        </div>

        {/* Sidebar Panel for Shelf Data */}
        {/* {selectedShelf && (
          <div className="w-80 bg-white border-l border-gray-200 shadow-xl flex flex-col animate-slide-in-right z-20">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Shelf {selectedShelf.name}</h2>
                <span className="text-xs text-gray-500 uppercase tracking-wide">Section A • Zone 1</span>
              </div>
              <Button onClick={() => setSelectedShelf(null)} variant="ghost" size="icon">
                <X size={20} />
              </Button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                  <Info size={16} className="mr-2 text-indigo-500" /> Specifications
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="block text-xs text-gray-500">Width</span>
                    <span className="font-bold text-gray-800">{(selectedShelf.width || 0).toFixed(1)}m</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="block text-xs text-gray-500">Depth</span>
                    <span className="font-bold text-gray-800">{(selectedShelf.depth || 0).toFixed(1)}m</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="block text-xs text-gray-500">Height</span>
                    <span className="font-bold text-gray-800">{(selectedShelf.height || 0).toFixed(1)}m</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="block text-xs text-gray-500">Max Weight</span>
                    <span className="font-bold text-gray-800">{selectedShelf.max_weight || selectedShelf.maxWeight}kg</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="block text-xs text-gray-500">Levels</span>
                    <span className="font-bold text-gray-800">{selectedShelf.levels}</span>
                  </div>
                   <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="block text-xs text-gray-500">Occupancy</span>
                    <span className={`font-bold ${selectedShelf.occupancy > 90 ? 'text-red-600' : 'text-green-600'}`}>
                      {selectedShelf.occupancy}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                  <Box size={16} className="mr-2 text-indigo-500" /> Current Inventory
                </h3>
                <div className="space-y-2">
                  {selectedShelf.products?.map((prod, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                      <span className="text-sm font-medium text-gray-700">{prod}</span>
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded">
                        {stableUnits(prod)} units
                      </span>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full py-2 mt-2 text-sm border-dashed">
                    + Add Product
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                <h4 className="text-sm font-bold text-orange-800 mb-1">Safety Check</h4>
                <p className="text-xs text-orange-700">
                  Current weight is {selectedShelf.currentWeight}. Ensure heaviest items are on bottom levels.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-border">
              <Button className="w-full py-3">
                Edit Layout
              </Button>
            </div>
          </div>
        )} */}

        {/* Floating Config Panel for Areas */}
        {selectedArea !== false && currentFloor && !selectedShelf && (
             <div className="w-80 bg-white border-l border-gray-200 shadow-xl flex flex-col animate-slide-in-right z-20">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-red-50">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-red-100 rounded-lg text-red-600">
                             <Layers size={18} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Area Settings</h2>
                            <p className="text-xs text-gray-500">Floor {currentFloorId}</p>
                        </div>
                    </div>
                    <Button onClick={() => setSelectedArea(false)} variant="ghost" size="icon">
                        <X size={20} />
                    </Button>
                </div>
                
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Area Name</label>
                        <input 
                            type="text" 
                            value={currentFloor.areas[selectedArea]?.area_name || ''}
                            onChange={(e) => updateAreaLabel(currentFloor.id, selectedArea, e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Width (m)</label>
                            <input 
                                type="number" 
                                step="0.1"
                                value={currentFloor.areas[selectedArea]?.width || 2}
                                onChange={(e) => updateAreaDimensions(currentFloor.id, selectedArea, parseFloat(e.target.value), currentFloor.areas[selectedArea].depth, currentFloor.areas[selectedArea].height)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border text-xs"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Depth (m)</label>
                            <input 
                                type="number" 
                                step="0.1"
                                value={currentFloor.areas[selectedArea]?.depth || 2}
                                onChange={(e) => updateAreaDimensions(currentFloor.id, selectedArea, currentFloor.areas[selectedArea].width, parseFloat(e.target.value), currentFloor.areas[selectedArea].height)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border text-xs"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Height (m)</label>
                            <input 
                                type="number" 
                                step="0.1"
                                value={currentFloor.areas[selectedArea]?.height || 3}
                                onChange={(e) => updateAreaDimensions(currentFloor.id, selectedArea, currentFloor.areas[selectedArea].width, currentFloor.areas[selectedArea].depth, parseFloat(e.target.value))}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border text-xs"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Area Type</label>
                        <select 
                            value={currentFloor.areas[selectedArea]?.area_type || 'PATHWAY'}
                            onChange={(e) => updateAreaProperty(currentFloor.id, selectedArea, 'area_type', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border text-sm"
                        >
                            <option value="Cross Docks">Cross-Dock</option>
                            <option value="Inbound Docks">Inbound Dock</option>
                            <option value="Outbound Docks">Outbound Dock</option>
                            <option value="PATHWAY">Pathway / Lane</option>
                            <option value="OPERATIONAL">Operational Area</option>
                            <option value="OBSTACLE">Stairs</option>
                            
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Usage Category</label>
                        <select 
                            value={currentFloor.areas[selectedArea]?.usage_category || 'HUMAN_ONLY'}
                            onChange={(e) => updateAreaProperty(currentFloor.id, selectedArea, 'usage_category', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border text-sm"
                        >
                            <option value="HUMAN_ONLY">Human Only</option>
                            <option value="FORKLIFT_LANE">Forklift Lane</option>
                            <option value="PACKING_STATION">Packing Station</option>
                            <option value="DOCK_DOOR">Dock Door</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 py-2">
                        <input 
                            type="checkbox"
                            id="is_passable"
                            checked={currentFloor.areas[selectedArea]?.is_passable ?? true}
                            onChange={(e) => updateAreaProperty(currentFloor.id, selectedArea, 'is_passable', e.target.checked)}
                            className="rounded border-gray-300 text-red-600 focus:ring-red-500 h-4 w-4"
                        />
                        <label htmlFor="is_passable" className="text-sm font-medium text-gray-700">
                            Is Passable (Allows Overlap)
                        </label>
                    </div>
                    
                    <div className={`p-4 rounded-lg border ${currentFloor.areas[selectedArea]?.is_passable ? 'bg-emerald-50 border-emerald-100' : 'bg-orange-50 border-orange-100'}`}>
                        <h4 className={`text-sm font-bold mb-1 ${currentFloor.areas[selectedArea]?.is_passable ? 'text-emerald-800' : 'text-orange-800'}`}>
                            {currentFloor.areas[selectedArea]?.is_passable ? 'Passable Area' : 'Obstacle Area'}
                        </h4>
                        <p className={`text-xs ${currentFloor.areas[selectedArea]?.is_passable ? 'text-emerald-700' : 'text-orange-700'}`}>
                            {currentFloor.areas[selectedArea]?.is_passable 
                                ? 'This area allows forklifts or humans to pass through. It can overlap with storage zones.' 
                                : 'This area blocks movement and shelf generation. Move it to represent stairs, pillars, or fixed equipment.'}
                        </p>
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex gap-2">
                        <Button 
                            variant="destructive" 
                            className="w-full flex items-center gap-2"
                            onClick={() => {
                                if (confirm('Are you sure you want to delete this area?')) {
                                    removeArea(currentFloor.id, selectedArea);
                                    setSelectedArea(false);
                                }
                            }}
                        >
                            <Trash2 size={16} /> Delete Area
                        </Button>
                    </div>
                </div>
            </div>
        )}

        {/* Add Zone Modal */}
        {isZoneModalOpen && (
            <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
                <div className="bg-card text-card-foreground rounded-lg shadow-lg p-6 w-96 animate-in fade-in zoom-in duration-200">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-gray-900">Add New Zone</h3>
                        <Button onClick={() => setIsZoneModalOpen(false)} variant="ghost" size="icon">
                            <X size={20} />
                        </Button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Zone Name</label>
                            <input 
                                type="text" 
                                value={newZoneData.name}
                                onChange={(e) => setNewZoneData({...newZoneData, name: e.target.value})}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="e.g., Cold Storage A"
                                autoFocus
                            />
                        </div>

                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Zone Type</label>
                            <select 
                                value={newZoneData.type}
                                onChange={(e) => setNewZoneData({...newZoneData, type: e.target.value})}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {Object.entries(ZONE_PRESETS).map(([key, config]) => (
                                    <option key={key} value={key}>{config.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <Button 
                            onClick={() => setIsZoneModalOpen(false)}
                            variant="outline"
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleConfirmAddZone}
                        >
                            Create Zone
                        </Button>
                    </div>
                </div>
            </div>
        )}
        {/* Zone Edit Sidebar */}
        {zoneEditor && (
          <div className="w-80 bg-white border-l border-gray-200 shadow-xl flex flex-col animate-slide-in-right z-20">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                  <Layers size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Zone Settings</h2>
                  <p className="text-xs text-gray-500">Floor {currentFloorId}</p>
                </div>
              </div>
              <Button onClick={() => setZoneEditor(null)} variant="ghost" size="icon">
                <X size={20} />
              </Button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zone Name</label>
                <input 
                  type="text" 
                  value={zoneEditor.name}
                  onChange={e => setZoneEditor({ ...zoneEditor, name: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Width (m)</label>
                  <input 
                    type="number" step="0.1" 
                    value={zoneEditor.width}
                    onChange={e => setZoneEditor({ ...zoneEditor, width: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Depth (m)</label>
                  <input 
                    type="number" step="0.1" 
                    value={zoneEditor.depth}
                    onChange={e => setZoneEditor({ ...zoneEditor, depth: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zone Type</label>
                <select 
                  value={zoneEditor.type}
                  onChange={e => setZoneEditor({ ...zoneEditor, type: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-sm"
                >
                  <option>General</option>
                  <option>Cold Storage</option>
                  <option>Bulk Storage</option>
                  <option>Hazardous</option>
                  <option>Sorting</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Theme Color</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={zoneEditor.color}
                    onChange={e => setZoneEditor({ ...zoneEditor, color: e.target.value })}
                    className="w-10 h-10 p-1 border border-gray-200 rounded cursor-pointer"
                  />
                  <span className="text-xs text-gray-500 font-mono uppercase">{zoneEditor.color}</span>
                </div>
              </div>

              <div className="pt-6 space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Transformations</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs flex items-center gap-1 justify-between px-2"
                      onClick={() => rotateZoneElements(zoneEditor.id, -90)}
                    >
                      <RotateCcw size={14} className="text-indigo-500" /> Left 90°
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs flex items-center gap-1 justify-between px-2"
                      onClick={() => rotateZoneElements(zoneEditor.id, 90)}
                    >
                      Right 90° <RotateCw size={14} className="text-indigo-500" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs flex items-center gap-1 justify-center relative overflow-hidden group"
                      onClick={() => flipZoneElements(zoneEditor.id, 'horizontal')}
                    >
                      <div className="absolute inset-0 bg-blue-50 transform -translate-x-full group-hover:translate-x-0 transition-transform"></div>
                      <FlipHorizontal size={14} className="text-blue-500 mr-1 relative z-10" /> 
                      <span className="relative z-10">Flip Horiz</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs flex items-center gap-1 justify-center relative overflow-hidden group"
                      onClick={() => flipZoneElements(zoneEditor.id, 'vertical')}
                    >
                      <div className="absolute inset-0 bg-blue-50 transform translate-y-full group-hover:translate-y-0 transition-transform"></div>
                      <FlipVertical size={14} className="text-blue-500 mr-1 relative z-10" /> 
                      <span className="relative z-10">Flip Vert</span>
                    </Button>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-tight">
                    Transforming the zone immediately rotates/mirrors all shelves inside it.
                  </p>
                </div>

                <div className="pt-2">
                  <Button onClick={applyZoneEdit} className="w-full bg-indigo-600 hover:bg-indigo-700">
                    Apply Changes
                  </Button>
                </div>
                
                <div className="pt-4 border-t border-gray-100">
                  <Button 
                    variant="destructive" 
                    className="w-full flex items-center gap-2"
                    onClick={() => {
                        if (confirm('Are you sure you want to delete this zone and ALL its shelves?')) {
                            removeZone(zoneEditor.id);
                            setZoneEditor(null);
                        }
                    }}
                  >
                    <Trash2 size={16} /> Delete Zone
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WarehousePage() {
  return (
    <WarehouseContent />
  );
}
