'use client';

import { useState, useRef, useEffect} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Box, Layers, X, Info, Maximize2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Draggable from 'react-draggable';
import { WmsProvider, useWms } from '../../../context/WmsContext';
import ShelfScene from '../../../components/ShelfScene';

import WarehouseWizard from '../../../components/WarehouseWizard';

const ZONE_PRESETS = {
  'General': { color: '#e5e7eb', shelfType: 'Standard Rack', label: 'General Storage' },
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
  return (
    <Draggable
      nodeRef={nodeRef}
      key={zone.id}
      bounds="parent"
      grid={[0.5 * PPM, 0.5 * PPM]}
      position={{ x: (zone.location_x || 0) * PPM, y: (zone.location_y || 0) * PPM }}
      onStart={() => setIsDragging(true)}
      onStop={(e, data) => handleStop(e, data, zone, 'zone')}
    >
      <div
        ref={nodeRef}
        onMouseMove={(e) => onZoneMouseMove && onZoneMouseMove(e, zone)}
        onMouseLeave={() => onZoneMouseLeave && onZoneMouseLeave()}
        onClick={() => !isDragging && openZoneEditor(zone)}
        className="absolute border-2 flex items-start justify-start p-2 cursor-move hover:border-opacity-100 group"
        style={{
          width: `${(zone.width || 5) * PPM}px`,
          height: `${(zone.depth || 5) * PPM}px`,
          backgroundColor: zone.color ? `${zone.color}40` : '#e5e7eb40', // 40 = 25% opacity
          borderColor: zone.color || '#9ca3af',
          zIndex: 0
        }}
      >
        <span className="text-xs font-bold text-gray-700 select-none bg-white/50 px-1 rounded">{zone.zone_name}</span>
        
        {/* Delete Button */}
        <button
          onClick={(e) => {
             e.stopPropagation(); // Prevent drag start
             if(confirm('Are you sure you want to delete this zone?')) {
                 removeZone(zone.id);
             }
          }}
          className="absolute top-0 right-0 p-1 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 rounded"
          title="Delete Zone"
          onMouseDown={(e) => e.stopPropagation()} // Prevent drag start
        >
           <Trash2 size={14} />
        </button>

        {/* Resize Handle */}
        <div 
          onMouseDown={(e) => startResize(e, zone)}
          className="absolute bottom-0 right-0 w-4 h-4 bg-gray-400 cursor-se-resize hover:bg-gray-600 rounded-tl-md opacity-0 group-hover:opacity-100 transition-opacity"
        ></div>
        
        {/* Render Children (Shelves) */}
        {children}
      </div>
    </Draggable>
  );
};

const DraggableShelf = ({ shelf, PPM, handleStop, setIsDragging, isDragging, setSelectedShelf, selectedShelf }) => {
  const nodeRef = useRef(null);
  return (
    <Draggable
      nodeRef={nodeRef}
      key={shelf.id}
      disabled={true}
      bounds="parent"
      grid={[0.5 * PPM, 0.5 * PPM]}
      position={{ x: shelf.relativeX, y: shelf.relativeY }}
      onStart={() => setIsDragging(true)}
      onStop={(e, data) => handleStop(e, data, shelf, 'shelf')}
    >
        <div 
          ref={nodeRef}
          onClick={() => !isDragging && setSelectedShelf(shelf)}
          className={`absolute border-2 flex flex-col items-center justify-center cursor-move transition-shadow hover:shadow-lg
            ${selectedShelf?.id === shelf.id ? 'border-indigo-600 bg-indigo-50 z-20' : 'border-gray-400 bg-white z-10'}
            ${shelf.type === 'Bulk Floor Space' ? 'bg-amber-100 border-amber-400' : ''}
            ${shelf.type === 'Cold Locker' ? 'bg-cyan-100 border-cyan-400' : ''}
          `}
          style={{
             width: `${shelf.width * PPM}px`,
             height: `${shelf.depth * PPM}px`
          }}
        >
          <span className="text-[10px] font-bold text-gray-600 pointer-events-none select-none">{shelf.name}</span>
        </div>
    </Draggable>
  );
};

const DraggableArea = ({ floorId, area, index, PPM, handleStop, setIsDragging, onSelect, removeArea }) => {
    const nodeRef = useRef(null);
    const width = (area.width || 2) * PPM;
    const depth = (area.depth || 2) * PPM;

    return (
        <Draggable
            nodeRef={nodeRef}
            bounds="parent"
            grid={[0.5 * PPM, 0.5 * PPM]}
            position={{ x: (area.location_x || 0) * PPM, y: (area.location_y || 0) * PPM }}
            onStart={() => setIsDragging(true)}
            onStop={(e, data) => handleStop(e, data, { floorId, index }, 'area')}
        >
            <div 
                ref={nodeRef}
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
                className="absolute bg-red-500/90 border-2 border-red-700 text-white flex items-center justify-center cursor-move shadow-md z-30 rounded-sm hover:border-white group"
                style={{ width: `${width}px`, height: `${depth}px` }}
            >
                <div className="text-center leading-tight">
                    <span className="text-[10px] font-bold pointer-events-none select-none block uppercase">{area.area_name || 'AREA'}</span>
                    <span className="text-[8px] opacity-80 pointer-events-none select-none block">
                        {(width/PPM).toFixed(1)}x{(depth/PPM).toFixed(1)}m
                    </span>
                </div>

                {/* Delete Button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if(confirm('Are you sure you want to delete this area?')) {
                            removeArea(floorId, index);
                        }
                    }}
                    className="absolute top-0 right-0 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 rounded"
                    title="Delete Area"
                >
                    <X size={10} />
                </button>
            </div>
        </Draggable>
    );
};

function WarehouseContent() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const [viewMode, setViewMode] = useState('2d'); // '2d' | '3d'
  const [selectedShelf, setSelectedShelf] = useState(null);
  const { state, updateShelfPosition, updateAreaPosition, updateZonePosition, updateZoneDimensions, updateAreaDimensions, updateAreaLabel, findNextAvailablePosition, setState, removeZone, addArea, removeArea, addZone } = useWms();
  const [selectedArea, setSelectedArea] = useState(false);
 const [currentFloorId, setCurrentFloorId] = useState(() => {
  // 1. Find the user's warehouse
  const myWh = state.warehouses?.find(wh => wh.id === user?.warehouse_id);
  
  if (myWh?.floors?.length > 0) {
    // 2. Look for floor_number 0, otherwise take the first floor available
    const groundFloor = myWh.floors.find(f => f.floor_number === 0);
    return groundFloor ? groundFloor.id : myWh.floors[0].id;
  }
  
  return null; 
});
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
  const [zoneHover, setZoneHover] = useState({ show: false, x: 0, y: 0, name: '', label: '' });
  const handleZoneMouseMove = (e, zone) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;
    const presetLabel = ZONE_PRESETS[zone.zone_type]?.label || zone.zone_type || '';
    setZoneHover({ show: true, x, y, name: zone.zone_name || '', label: presetLabel });
  };
  const clearZoneHover = () => setZoneHover(prev => ({ ...prev, show: false }));

  // If not configured or explicitly editing, show Wizard
  if (!user || !state.isConfigured || editMode) {
     if (!user) return null; // Wait for redirect
     return <WarehouseWizard onClose={() => {
        if (state.isConfigured) router.push('/dashboard/warehouse');
        else router.push('/dashboard');
     }} />;
  }
  // Filter shelves for 2D view based on current floor
  const currentFloorZones = state.zones.filter(z => z.floor_id === currentFloorId);
  const floorZones = currentFloorZones.map(z => z.id);
  const filteredShelves = state.shelves.filter(s => floorZones.includes(s.zone_id));
  const currentFloor = state.floors.find(f => f.id === currentFloorId);

  // Scaling Factor (Pixels per Meter)
  const PPM = 30;


  const startResize = (e, zone) => {
    e.stopPropagation();
    resizingRef.current = {
      zoneId: zone.id,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: zone.width * PPM,
      startHeight: zone.depth * PPM
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
    const { zoneId, startX, startY, startWidth, startHeight } = resizingRef.current;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    // Snap to grid
    const newPixelWidth = Math.max(50, startWidth + deltaX); // Min 50px
    const newPixelHeight = Math.max(50, startHeight + deltaY);

    const snap = 0.5 * PPM;
    const snappedWidth = Math.round(newPixelWidth / snap) * snap;
    const snappedHeight = Math.round(newPixelHeight / snap) * snap;

    // Check Area Collision during resize
    const floor = state.floors.find(f => f.id === currentFloorId);
    if (floor) {
        // Current Zone Position (static during resize)
        const zone = state.zones.find(z => z.id === zoneId);
        if (zone && Array.isArray(floor.areas)) {
            const resizingRect = { 
                x: zone.location_x, 
                y: zone.location_y, 
                w: snappedWidth / PPM, 
                h: snappedHeight / PPM 
            };
            
            const overlappingArea = floor.areas.find(area => {
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
    
    updateZoneDimensions(zoneId, snappedWidth / PPM, snappedHeight / PPM);
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

  const applyZoneEdit = () => {
    if (!zoneEditor) return;
    const { id, width, depth, name, type, color } = zoneEditor;
    updateZoneDimensions(id, parseFloat(width) || 1, parseFloat(depth) || 1);
    setState(prev => ({
      ...prev,
      zones: prev.zones.map(z => 
        z.id === id ? { ...z, zone_name: name, zone_type: type, color } : z
      )
    }));
    setZoneEditor(null);
  };

  const handleStop = (e, data, item, type) => {
    // Snap to grid (0.5m)
    const snap = 0.5 * PPM;
    const rawX = data.x;
    const rawY = data.y;
    
    const snappedX = Math.round(rawX / snap) * snap;
    const snappedY = Math.round(rawY / snap) * snap;

    // Convert back to meters
    const meterX = snappedX / PPM;
    const meterY = snappedY / PPM;

    if (type === 'shelf') {
        updateShelfPosition(item.id, meterX, meterY);
    } else if (type === 'area') {
        const { floorId, index } = item || {};
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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Visual Designer</h1>
          <p className="text-gray-500 mt-2">Drag and drop to configure Floor {currentFloorId}.</p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Add Zone Button */}
          {viewMode === '2d' && (
              <button 
                onClick={handleAddZoneClick}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-purple-700 flex items-center gap-2"
              >
                <Layers size={18} /> Add Zone
              </button>
          )}

          {viewMode === '2d' && (
              <button 
                onClick={() => addArea(currentFloorId, 'New Area')}
                className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-red-700 flex items-center gap-2"
              >
                Add Area
              </button>
          )}

          {/* Add Shelf is available in Shelves Layout (Data Entry) page, not here */}

          {/* Floor Switcher */}
         <div className="flex items-center bg-white rounded-lg border border-gray-200 p-1 shadow-sm">
          {state.warehouses.map(wh => {
            if (wh.id === user?.warehouse_id) {
              // You MUST return the mapped array here
              return wh.floors.map(floor => (
                <button
                  key={floor.id}
                  onClick={() => setCurrentFloorId(floor.id)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    currentFloorId === floor.id
                      ? 'bg-blue-100 text-blue-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {floor.name || `Floor ${floor.floor_number}`}
                </button>
              ));
            }
            return null; // Return null for warehouses that don't match
          })}
        </div>

          {/* Toggle Switch */}
          <div className="bg-white p-1 rounded-lg border border-gray-200 flex items-center shadow-sm">
            <button
              onClick={() => setViewMode('2d')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === '2d' 
                  ? 'bg-indigo-100 text-indigo-700 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Shelves Layout
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === '3d' 
                  ? 'bg-indigo-100 text-indigo-700 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              3D View
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden relative">
        {/* Main Viewport */}
        <div className="flex-1 bg-white rounded-xl shadow-inner border border-gray-200 overflow-hidden relative">
          
          <div className="relative z-10 h-full w-full overflow-auto bg-slate-50">
             {viewMode === '2d' ? (
               <div 
                 className="relative bg-white shadow-sm mx-auto mt-10 border border-gray-300"
                 ref={canvasRef}
                 style={{
                    width: `${state.warehouseDims.widthM * PPM}px`,
                    height: `${state.warehouseDims.depthM * PPM}px`,
                    backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)',
                    backgroundSize: `${0.5 * PPM}px ${0.5 * PPM}px` // 0.5m grid
                 }}
               >
                 {/* Canvas Label */}
                 <div className="absolute -top-6 left-0 text-xs text-gray-400 font-mono">
                    Warehouse Bounds ({state.warehouseDims.widthM}m x {state.warehouseDims.depthM}m)
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
                    />
                 ))}

               </div>
             ) : (
               <div className="w-full h-full rounded-xl overflow-hidden bg-slate-900 relative">
                 <ShelfScene selectedShelfId={selectedShelf?.id} floorId={currentFloorId} />
                 
                 <div className="absolute bottom-4 right-4 bg-white/90 p-4 rounded-lg shadow text-xs text-gray-500 z-10">
                   <p className="font-bold mb-1">3D Visualization</p>
                   <p>Rotate: Left Click + Drag</p>
                   <p>Zoom: Scroll</p>
                   <p>Pan: Right Click + Drag</p>
                 </div>
               </div>
             )}
          </div>
        </div>

        {/* Sidebar Panel for Shelf Data */}
        {selectedShelf && (
          <div className="w-80 bg-white border-l border-gray-200 shadow-xl flex flex-col animate-slide-in-right z-20">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Shelf {selectedShelf.name}</h2>
                <span className="text-xs text-gray-500 uppercase tracking-wide">Section A • Zone 1</span>
              </div>
              <button onClick={() => setSelectedShelf(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                  <Info size={16} className="mr-2 text-indigo-500" /> Specifications
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="block text-xs text-gray-500">Max Weight</span>
                    <span className="font-bold text-gray-800">{selectedShelf.maxWeight}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="block text-xs text-gray-500">Depth</span>
                    <span className="font-bold text-gray-800">{selectedShelf.depth}m</span>
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
                  <button className="w-full py-2 mt-2 text-sm text-indigo-600 font-medium hover:bg-indigo-50 rounded-lg border border-dashed border-indigo-200">
                    + Add Product
                  </button>
                </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                <h4 className="text-sm font-bold text-orange-800 mb-1">Safety Check</h4>
                <p className="text-xs text-orange-700">
                  Current weight is {selectedShelf.currentWeight}. Ensure heaviest items are on bottom levels.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100">
              <button className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors">
                Edit Layout
              </button>
            </div>
          </div>
        )}

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
                    <button onClick={() => setSelectedArea(false)} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Area Name</label>
                        <input 
                            type="text" 
                            value={currentFloor.areas[selectedArea]?.area_name || ''}
                            onChange={(e) => updateAreaLabel(currentFloor.id, selectedArea, e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Width (meters)</label>
                        <input 
                            type="number" 
                            step="0.1"
                            value={currentFloor.areas[selectedArea]?.width || 2}
                            onChange={(e) => updateAreaDimensions(currentFloor.id, selectedArea, parseFloat(e.target.value), currentFloor.areas[selectedArea].depth, currentFloor.areas[selectedArea].height)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Depth (meters)</label>
                        <input 
                            type="number" 
                            step="0.1"
                            value={currentFloor.areas[selectedArea]?.depth || 2}
                            onChange={(e) => updateAreaDimensions(currentFloor.id, selectedArea, currentFloor.areas[selectedArea].width, parseFloat(e.target.value), currentFloor.areas[selectedArea].height)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border"
                        />
                    </div>
                    
                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                        <h4 className="text-sm font-bold text-orange-800 mb-1">Collision Warning</h4>
                        <p className="text-xs text-orange-700">
                            Objects placed here will block shelf generation in this area. Move the red box to the correct location of your stairs, elevator, or obstacles.
                        </p>
                    </div>
                </div>
             </div>
        )}

        {/* Add Zone Modal */}
        {isZoneModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl shadow-xl p-6 w-96 animate-in fade-in zoom-in duration-200">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-gray-900">Add New Zone</h3>
                        <button onClick={() => setIsZoneModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Zone Name</label>
                            <input 
                                type="text" 
                                value={newZoneData.name}
                                onChange={(e) => setNewZoneData({...newZoneData, name: e.target.value})}
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-2 border"
                                placeholder="e.g., Cold Storage A"
                                autoFocus
                            />
                        </div>

                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Zone Type</label>
                            <select 
                                value={newZoneData.type}
                                onChange={(e) => setNewZoneData({...newZoneData, type: e.target.value})}
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-2 border"
                            >
                                {Object.entries(ZONE_PRESETS).map(([key, config]) => (
                                    <option key={key} value={key}>{config.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <button 
                            onClick={() => setIsZoneModalOpen(false)}
                            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleConfirmAddZone}
                            className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                        >
                            Create Zone
                        </button>
                    </div>
                </div>
            </div>
        )}
        {/* Zone Edit Modal */}
        {zoneEditor && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800">Edit Zone</h3>
                <button onClick={() => setZoneEditor(null)} className="text-gray-500 hover:text-gray-700">Close</button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input 
                    type="text" 
                    value={zoneEditor.name}
                    onChange={e => setZoneEditor({ ...zoneEditor, name: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Width (X, meters)</label>
                  <input 
                    type="number" step="0.1" 
                    value={zoneEditor.width}
                    onChange={e => setZoneEditor({ ...zoneEditor, width: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Depth (Y, meters)</label>
                  <input 
                    type="number" step="0.1" 
                    value={zoneEditor.depth}
                    onChange={e => setZoneEditor({ ...zoneEditor, depth: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select 
                    value={zoneEditor.type}
                    onChange={e => setZoneEditor({ ...zoneEditor, type: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg"
                  >
                    <option>General</option>
                    <option>Cold Storage</option>
                    <option>Bulk Storage</option>
                    <option>Hazardous</option>
                    <option>Sorting</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <input 
                    type="color" 
                    value={zoneEditor.color}
                    onChange={e => setZoneEditor({ ...zoneEditor, color: e.target.value })}
                    className="w-full h-10 p-1 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => setZoneEditor(null)} className="px-4 py-2 bg-white border border-gray-300 rounded-lg">Cancel</button>
                <button onClick={applyZoneEdit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Save</button>
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
