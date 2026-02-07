'use client';

import { useState, useEffect, useMemo } from 'react';
import { useWms } from '../../../../context/WmsContext';
import { useAuth } from '../../../../context/AuthContext';
import { Plus, Save, Trash2, ChevronRight, ChevronDown, Warehouse, Map, Box, ArrowLeft, Shield, Star } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function LayoutEntryPage() {
  const { state, fetchWarehouses, saveBulkShelves, deleteShelf, findNextAvailablePosition } = useWms();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Sorting Logic: Move user's assigned warehouse to the top
  const sortedWarehouses = useMemo(() => {
    if (!state.warehouses) return [];
    if (!user?.warehouse_id) return state.warehouses;

    return [...state.warehouses].sort((a, b) => {
      if (a.id === user.warehouse_id) return -1;
      if (b.id === user.warehouse_id) return 1;
      return 0;
    });
  }, [state.warehouses, user?.warehouse_id]);

  // Permission Logic
  const warehouseId = searchParams.get('warehouseId');
  const isReadonlyParam = searchParams.get('readonly') === 'true';
  const currentWhObj = warehouseId ? state.warehouses.find(wh => wh.id === parseInt(warehouseId)) : null;
  const isOwner = currentWhObj?.created_by === user?.id;
  const readonly = isReadonlyParam || (user?.role === 'staff') || (warehouseId && !isOwner);

  // Bulk Generator State
  const initialBulkState = useMemo(() => ({
    start_aisle: 1,
    num_aisles: 1,
    bays_per_aisle: 1,
    levels_per_bay: 1,
    bay_width: 1.5,
    bay_depth: 1.2,
    level_height: 0.8,
    aisle_gap: 3.0,
    shelf_type: 'Standard Rack'
  }), []);

  const [bulkData, setBulkData] = useState(initialBulkState);
  const [gapEdited, setGapEdited] = useState(false);

  const GAP_DEFAULTS = {
    'SELECTIVE_PALLET': 3.5,
    'DRIVE_IN': 3.5,
    'BIN_SHELVING': 1.2,
    'HANGING_RACK': 1.5,
    'BULK_FLOOR_SPACE': 3.0,
    'COLD_LOCKER': 3.2,
    'Standard Rack': 3.0,
    'CANTILEVER': 3.5,
    'CARTON_FLOW': 3.0 
  };

  // Logic to repopulate form when Zone is selected
  useEffect(() => {
    if (!selectedZone) return;

    const zoneShelves = state.shelves.filter(s => s.zone_id === selectedZone);
    if (zoneShelves.length > 0) {
        const first = zoneShelves[0];
        const aisles = new Set(zoneShelves.map(s => s.aisle_num));
        const minAisle = Math.min(...aisles);
        const numAisles = aisles.size;
        const maxBay = Math.max(...zoneShelves.map(s => s.bay_num));
        const maxLevel = Math.max(...zoneShelves.map(s => s.level_num));
        
        let inferredGap = initialBulkState.aisle_gap;
        const aisleRows = {};
        zoneShelves.forEach(s => {
            const key = s.aisle_num;
            const isTop = s.facing ? (s.facing === 'positive') : (s.bay_num % 2 === 1);
            if (!aisleRows[key]) aisleRows[key] = { top: undefined, bottom: undefined };
            if (isTop) {
                aisleRows[key].top = (aisleRows[key].top === undefined) ? s.location_y : Math.min(aisleRows[key].top, s.location_y);
            } else {
                aisleRows[key].bottom = (aisleRows[key].bottom === undefined) ? s.location_y : Math.min(aisleRows[key].bottom, s.location_y);
            }
        });
        const candidateAisle = Math.min(...Object.keys(aisleRows).map(n => parseInt(n, 10)));
        const rows = aisleRows[candidateAisle];
        if (rows && rows.top !== undefined && rows.bottom !== undefined) {
            const rawGap = (rows.bottom - rows.top) - first.depth;
            inferredGap = parseFloat(rawGap.toFixed(1));
        }

        setBulkData({
            start_aisle: minAisle,
            num_aisles: numAisles,
            bays_per_aisle: maxBay,
            levels_per_bay: maxLevel,
            bay_width: first.width,
            bay_depth: first.depth,
            level_height: first.height,
            aisle_gap: inferredGap || 3.0,
            shelf_type: first.shelf_type || first.type
        });
        setGapEdited(false);
    } else {
        setBulkData(initialBulkState);
        setGapEdited(false);
    }
  }, [selectedZone, state.shelves, initialBulkState]);

  useEffect(() => {
    if (selectedWarehouse && !selectedFloor) {
      const firstFloor = state.floors.find(f => f.warehouse_id === selectedWarehouse);
      if (firstFloor) setSelectedFloor(firstFloor.id);
    }
  }, [selectedWarehouse, state.floors, selectedFloor]);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const filteredFloors = state.floors.filter(f => f.warehouse_id == selectedWarehouse);
  const filteredZones = state.zones.filter(z => z.floor_id == selectedFloor);
  const filteredShelves = state.shelves.filter(s => s.zone_id == selectedZone);

  const handleBulkChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'aisle_gap') {
        setGapEdited(true);
        setBulkData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else if (name === 'shelf_type') {
        const newType = value;
        setBulkData(prev => {
            const newData = { ...prev, shelf_type: newType };
            if (!gapEdited) {
               newData.aisle_gap = GAP_DEFAULTS[newType] || 3.0;
            }
            return newData;
        });
    } else {
        setBulkData(prev => ({
          ...prev,
          [name]: (name === 'shelf_type') ? value : (parseFloat(value) || 0)
        }));
    }
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (!selectedZone) {
      alert('Please select a zone first');
      return;
    }

    const newShelves = [];
    let { 
      start_aisle, num_aisles, bays_per_aisle, levels_per_bay, 
      bay_width, bay_depth, level_height, aisle_gap, shelf_type
    } = bulkData;

    const zoneObj = state.zones.find(z => z.id === selectedZone);
    const zoneLeft = (zoneObj?.location_x || 0);
    const zoneTop = (zoneObj?.location_y || 0);
    const zoneRight = zoneLeft + (zoneObj?.width || state.warehouseDims.widthM);
    const zoneBottom = zoneTop + (zoneObj?.depth || state.warehouseDims.depthM);
    const start_x = zoneLeft;
    const start_y = zoneTop;

    const overlapsAny = (x, y, z, w, d, h, items) => {
      return items.some(it => {
        const ix = it.location_x; const iy = it.location_y; const iz = it.location_z || 0;
        const iw = it.width; const id = it.depth; const ih = it.height || 0;
        return (x < ix + iw && x + w > ix && y < iy + id && y + d > iy && z < iz + ih && z + h > iz);
      });
    };

    const existingShelves = filteredShelves.length > 0 ? [] : state.shelves.filter(s => s.zone_id === selectedZone); 
    const obstacles = [...existingShelves];
    const currentFloorObj = state.floors.find(f => f.id === selectedFloor);
    
    if (currentFloorObj) {
      if (Array.isArray(currentFloorObj.stairs)) {
           currentFloorObj.stairs.forEach(st => {
             obstacles.push({ location_x: st.location_x || st.x, location_y: st.location_y || st.y, width: st.width || 2, depth: st.depth || 2, height: 10, location_z: 0 });
           });
      }
      if (Array.isArray(currentFloorObj.areas)) {
        currentFloorObj.areas.forEach(area => {
          obstacles.push({ location_x: area.location_x || area.x, location_y: area.location_y || area.y, width: area.width, depth: area.depth, height: area.height || 10, location_z: 0 });
        });
      }
    }

    const BACK_GAP = 0.2;
    let yCursor = start_y;
    for (let a = 0; a < num_aisles; a++) {
      const aisleNum = start_aisle + a;
      const topRowY = yCursor;
      const bottomRowY = topRowY + bay_depth + aisle_gap;
      const oddCount = Math.ceil(bays_per_aisle / 2);
      const evenCount = Math.floor(bays_per_aisle / 2);

      // Top Row
      for (let b = 0; b < oddCount; b++) {
        const bayNum = 2 * b + 1;
        const bayX = start_x + b * bay_width;
        for (let l = 0; l < levels_per_bay; l++) {
          const levelNum = l + 1;
          const levelZ = l * level_height;
          if ((bayX + bay_width <= zoneRight) && (topRowY + bay_depth <= zoneBottom)) {
            if (!overlapsAny(bayX, topRowY, levelZ, bay_width, bay_depth, level_height, obstacles) && !overlapsAny(bayX, topRowY, levelZ, bay_width, bay_depth, level_height, newShelves)) {
              newShelves.push({ zone_id: selectedZone, shelf_code: `A${aisleNum}-B${bayNum}-L${levelNum}`, shelf_type, aisle_num: aisleNum, bay_num: bayNum, level_num: levelNum, bin_num: 1, location_x: bayX, location_y: topRowY, location_z: levelZ, width: bay_width, height: level_height, depth: bay_depth, max_weight: 500, orientation_angle: 0, status: 'active' });
            }
          }
        }
      }

      // Bottom Row
      for (let b = 0; b < evenCount; b++) {
        const bayNum = 2 * (b + 1);
        const bayX = start_x + b * bay_width;
        for (let l = 0; l < levels_per_bay; l++) {
          const levelNum = l + 1;
          const levelZ = l * level_height;
          if ((bayX + bay_width <= zoneRight) && (bottomRowY + bay_depth <= zoneBottom)) {
            if (!overlapsAny(bayX, bottomRowY, levelZ, bay_width, bay_depth, level_height, obstacles) && !overlapsAny(bayX, bottomRowY, levelZ, bay_width, bay_depth, level_height, newShelves)) {
              newShelves.push({ zone_id: selectedZone, shelf_code: `A${aisleNum}-B${bayNum}-L${levelNum}`, shelf_type, aisle_num: aisleNum, bay_num: bayNum, level_num: levelNum, bin_num: 1, location_x: bayX, location_y: bottomRowY, location_z: levelZ, width: bay_width, height: level_height, depth: bay_depth, max_weight: 500, orientation_angle: 180, status: 'active' });
            }
          }
        }
      }
      yCursor = bottomRowY + bay_depth + BACK_GAP;
    }

    const success = await saveBulkShelves(selectedZone, newShelves);
    if (success) setShowForm(false); else alert("Failed to save layout to database.");
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Shelves Layout Data Entry</h1>
          <p className="text-gray-500 mt-2">Manage warehouses, zones, and generate shelf layouts.</p>
        </div>
        <Link href="/dashboard/warehouse" className="text-indigo-600 hover:text-indigo-800 flex items-center gap-2">
            View Visualization <ChevronRight size={16} />
        </Link>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left Panel: Hierarchy */}
        <div className="w-1/4 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100 font-semibold text-gray-700 bg-gray-50 rounded-t-xl">
            Hierarchy
          </div>
          <div className="overflow-y-auto p-2 space-y-2">
            {sortedWarehouses.map(wh => (
              <div key={wh.id} className="space-y-1">
                <div 
                  onClick={() => setSelectedWarehouse(wh.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${selectedWarehouse === wh.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                  <Warehouse size={16} />
                  <span className="font-medium text-sm truncate flex-1">
                   
                    {wh.id === user?.warehouse_id ? (
                      <span className="inline-flex items-center rounded font-bold bg-green-100 text-green-700">
                         {wh.name}
                      </span>
                    ): (
                      wh.name
                    )}
                  </span>
                  {selectedWarehouse === wh.id && readonly && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-200 ml-auto">
                      <Shield size={12} /> Read Only
                    </div>
                  )}
                </div>
                
                {selectedWarehouse === wh.id && (
                  <div className="ml-4 space-y-1 border-l-2 border-gray-100 pl-2">
                    {filteredFloors.map((floor) => (
                      <div key={floor.id}>
                        <div 
                          onClick={() => setSelectedFloor(floor.id)}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${selectedFloor === floor.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}
                        >
                          <Map size={14} />
                          <span className="text-sm font-medium">{floor.name}</span>
                        </div>

                        {selectedFloor === floor.id && (
                          <div className="ml-4 space-y-1 border-l-2 border-blue-100 pl-2">
                            {state.zones.filter(z => z.floor_id === floor.id).map((zone) => (
                              <div 
                                key={zone.id}
                                onClick={() => setSelectedZone(zone.id)}
                                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${selectedZone === zone.id ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-gray-50 text-gray-500'}`}
                              >
                                <Box size={12} />
                                <span className="text-xs">{zone.zone_name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Shelves List & Form */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Box size={18} />
              Shelves in {state.zones.find(z => z.id === selectedZone)?.zone_name || 'Selected Zone'}
            </h2>
            <button 
              onClick={() => setShowForm(true)}
              disabled={readonly}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-colors ${readonly ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
            >
              <Plus size={16} /> {filteredShelves.length > 0 ? "Edit Layout" : "Bulk Generator"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {showForm ? (
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-800">
                    {filteredShelves.length > 0 ? "Edit Layout" : "Bulk Shelf Generator"}
                  </h3>
                  <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
                
                <form onSubmit={handleBulkSubmit} className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 border-b border-gray-200 pb-2 mb-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Grid Logic</span>
                  </div>
                  
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Aisle #</label>
                    <input type="number" name="start_aisle" value={bulkData.start_aisle} onChange={handleBulkChange} disabled={readonly} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border disabled:bg-gray-100" required />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Aisles</label>
                    <input type="number" name="num_aisles" value={bulkData.num_aisles} onChange={handleBulkChange} disabled={readonly} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border disabled:bg-gray-100" required />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bays per Aisle</label>
                    <input type="number" name="bays_per_aisle" value={bulkData.bays_per_aisle} onChange={handleBulkChange} disabled={readonly} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border disabled:bg-gray-100" required />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Levels per Bay</label>
                    <input type="number" name="levels_per_bay" value={bulkData.levels_per_bay} onChange={handleBulkChange} disabled={readonly} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border disabled:bg-gray-100" required />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shelf Type</label>
                    <select name="shelf_type" value={bulkData.shelf_type} onChange={handleBulkChange} disabled={readonly} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border disabled:bg-gray-100">
                        <option value="Standard Rack">Standard Rack</option>
                        <option value="SELECTIVE_PALLET">Selective Pallet</option>
                        <option value="CANTILEVER">Cantilever</option>
                        <option value="DRIVE_IN">Drive In</option>
                        <option value="CARTON_FLOW">Carton Flow</option>
                        <option value="BIN_SHELVING">Bin Shelving</option>
                        <option value="BULK_FLOOR_SPACE">Bulk Floor Space</option>
                        <option value="COLD_LOCKER">Cold Locker</option>
                        <option value="HANGING_RACK">Hanging Rack</option>
                    </select>
                  </div>
                  
                  <div className="col-span-12 border-b border-gray-200 pb-2 mb-2 mt-4">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Dimensions & Spacing (Meters)</span>
                  </div>

                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bay Width</label>
                    <input type="number" step="0.1" name="bay_width" value={bulkData.bay_width} onChange={handleBulkChange} disabled={readonly} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border disabled:bg-gray-100" />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bay Depth</label>
                    <input type="number" step="0.1" name="bay_depth" value={bulkData.bay_depth} onChange={handleBulkChange} disabled={readonly} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border disabled:bg-gray-100" />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Level Height</label>
                    <input type="number" step="0.1" name="level_height" value={bulkData.level_height} onChange={handleBulkChange} disabled={readonly} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border disabled:bg-gray-100" />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Aisle Gap</label>
                    <input type="number" step="0.1" name="aisle_gap" value={bulkData.aisle_gap} onChange={handleBulkChange} disabled={readonly} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border disabled:bg-gray-100" />
                  </div>

                  {/* Validation Warnings */}
                  {(() => {
                    const warnings = [];
                    const zone = state.zones.find(z => z.id === selectedZone);
                    if (zone) {
                        const { num_aisles, bays_per_aisle, levels_per_bay, bay_width, bay_depth, level_height, aisle_gap } = bulkData;
                        const baysPerRow = Math.ceil(bays_per_aisle / 2);
                        const totalW = baysPerRow * bay_width;
                        const pairDepth = (2 * bay_depth) + aisle_gap;
                        const totalD = (num_aisles * pairDepth) + (Math.max(0, num_aisles - 1) * 0.2);
                        const totalH = levels_per_bay * level_height;

                        const zW = zone.width || state.warehouseDims.widthM;
                        if (totalW > zW) warnings.push(`Total layout width (${totalW.toFixed(1)}m) exceeds Zone width (${zW}m).`);

                        const zD = zone.depth || state.warehouseDims.depthM;
                        if (totalD > zD) warnings.push(`Total layout depth (${totalD.toFixed(1)}m) exceeds Zone depth (${zD}m).`);

                        const whHeight = state.warehouseDims.heightM || 10;
                        if (totalH > whHeight) warnings.push(`Total layout height (${totalH.toFixed(1)}m) exceeds Warehouse height (${whHeight}m).`);
                    }

                    if (warnings.length > 0) {
                        return (
                            <div className="col-span-12 bg-amber-50 border border-amber-200 rounded-md p-3 mt-2">
                                <h4 className="text-sm font-semibold text-amber-800 mb-1">Layout Validation Warnings</h4>
                                <ul className="list-disc list-inside text-sm text-amber-700">
                                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                            </div>
                        );
                    }
                    return null;
                  })()}

                  <div className="col-span-12 flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                    <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={readonly} className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm flex items-center gap-2 ${readonly ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                      <Save size={16} /> {filteredShelves.length > 0 ? "Update Layout" : "Generate Layout"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dimensions (WxDxH)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Max Weight</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredShelves.length > 0 ? (
                      filteredShelves.map((shelf, idx) => (
                        <tr key={shelf.shelf_code || idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{shelf.shelf_code}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Aisle {shelf.aisle_num}, Bay {shelf.bay_num}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shelf.width} x {shelf.depth} x {shelf.height}m</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shelf.max_weight}kg</td>
                          <td className="px-6 py-4 text-right">
                            {!readonly && (
                              <button onClick={() => { if(window.confirm("Delete shelf?")) deleteShelf(shelf.id); }} className="text-red-600 hover:text-red-900">
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="px-6 py-12 text-center text-sm text-gray-500">No shelves found in this zone. Select a zone and click “Bulk Generator”.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}