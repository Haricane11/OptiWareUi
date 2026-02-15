'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const WmsContext = createContext();

// Mock Data Generator for Context
const generateMockData = () => {
  return {
    isConfigured: false,
    isUpdateModalOpen: false,
    activeUpdateId: null,
    warehouses: [],
    floors: [],
    zones: [],
    shelves: [],
    warehouseDims: {
      widthM: 30,
      depthM: 30,
      heightM: 10
    },
    floorHeight: 5,
  };
};

export function WmsProvider({ children }) {
  const [state, setState] = useState(generateMockData());

  

  const openUpdateModal = (warehouseId) => {
    setState(prev => ({ ...prev, isUpdateModalOpen: true, activeUpdateId: warehouseId }));
  };

  const closeUpdateModal = () => {
    setState(prev => ({ ...prev, isUpdateModalOpen: false, activeUpdateId: null }));
  };

  const updateWarehouseMetadata = async (id, data, currentUserId) => {
    try {
      const res = await fetch(`http://localhost:8000/warehouses/${id}?current_user_id=${currentUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        await fetchWarehouses();
        return true;
      }
    } catch (error) {
      console.error("Error updating warehouse:", error);
    }
    return false;
  };

  const fetchWarehouses = async () => {
    console.log("Debug: fetchWarehouses called");
    try {
      console.log("Debug: Fetching from http://localhost:8000/warehouses");
      const res = await fetch("http://localhost:8000/warehouses");
      console.log("Debug: Fetch status:", res.status);
      const data = await res.json();
      console.log("Retrieved Warehouses:", data);
      
      if (data && Array.isArray(data)) {
        // Correctly flatten the nested hierarchy while maintaining IDs and fields
        const allFloors = [];
        const allZones = [];
        const allShelves = [];

        data.forEach(wh => {
          (wh.floors || []).forEach(f => {
            allFloors.push({
              ...f,
              warehouse_id: wh.id,
              name: f.name || `Floor ${f.floor_number}`,
              id: f.id || `temp-f-${wh.id}-${f.floor_number}`
            });

            (f.zones || []).forEach(z => {
              allZones.push({
                ...z,
                floor_id: f.id,
                id: z.id || `temp-z-${f.id}-${z.zone_name}`
              });

              (z.shelves || []).forEach(s => {
                allShelves.push({
                  ...s,
                  zone_id: z.id,
                  id: s.id || `temp-s-${z.id}-${s.shelf_code}`,
                  name: s.name || s.shelf_code // Ensure name fallback
                });
              });
            });
          });
        });

        const firstWh = data[0];
        const dims = firstWh ? {
          widthM: parseFloat(firstWh.width) || 30,
          depthM: parseFloat(firstWh.depth) || 30,
          heightM: parseFloat(firstWh.height) || 10
        } : { widthM: 30, depthM: 30, heightM: 10 };

        setState(prev => ({
          ...prev,
          warehouses: data,
          floors: allFloors,
          zones: allZones,
          shelves: allShelves,
          warehouseDims: dims,
          isConfigured: data.length > 0
        }));
      }
    } catch (error) {
      console.error("Error fetching warehouses:", error);
    }
  };
useEffect(() => {
    fetchWarehouses();
  }, []);
  // Helper: Find next available position
  const findNextAvailablePosition = (width, depth, floorId, itemType = 'shelf') => {
    let x = itemType === 'shelf' ? 2 : 0;
    let y = itemType === 'shelf' ? 2 : 0;
    const gap = 0.5;
    const currentFloorObj = state.floors.find(f => f.id == floorId);
    const floorWidth = (currentFloorObj && currentFloorObj.width) ? currentFloorObj.width : state.warehouseDims.widthM;
    const floorDepth = state.warehouseDims.depthM;

    let existingItems = [];
    if (itemType === 'shelf') {
        const floorZones = state.zones.filter(z => z.floor_id == floorId).map(z => z.id);
        existingItems = state.shelves.filter(s => floorZones.includes(s.zone_id));
    } else if (itemType === 'zone') {
        existingItems = state.zones.filter(z => z.floor_id == floorId);
    }

    const currentFloorContent = state.floors.find(f => f.id == floorId);
    if (currentFloorContent && currentFloorContent.areas && currentFloorContent.areas.length > 0) {
         currentFloorContent.areas.forEach(st => {
           existingItems.push({
             location_x: st.location_x,
             location_y: st.location_y,
             width: st.width || 2,
             depth: st.depth || 2
           });
         });
    }

    // Simple grid search until no collision
    let attempts = 0;
    while (attempts < 1000) {
      const withinBounds = (x + width <= floorWidth) && (y + depth <= floorDepth);
      if (withinBounds) {
        const collision = existingItems.some(item => {
          const itemX = item.location_x || 0;
          const itemY = item.location_y || 0;
          const itemW = item.width || 0;
          const itemD = item.depth || 0;
          return (
            x < itemX + itemW + gap &&
            x + width + gap > itemX &&
            y < itemY + itemD + gap &&
            y + depth + gap > itemY
          );
        });
        if (!collision) {
          return { x, y };
        }
      }

      x += 0.5;
      if (x + width > floorWidth) {
        x = itemType === 'shelf' ? 2 : 0;
        y += 0.5;
      }
      if (y + depth > floorDepth) break;
      attempts++;
    }
    return { x: 2, y: 2 }; 
  };

  const updateShelfPosition = async (shelfId, x, y) => {
    // Update local state first for responsiveness
    setState(prev => ({
      ...prev,
      shelves: prev.shelves.map(s => s.id === shelfId ? { ...s, location_x: x, location_y: y } : s)
    }));
    // Persist to DB
    await updateShelf(shelfId, { location_x: x, location_y: y });
  };

  const updateAreaPosition = async (floorId, areaIndex, x, y) => {
     const floor = state.floors.find(f => f.id === floorId);
     const area = floor?.areas?.[areaIndex];
     if (!area || !area.id) return;

     setState(prev => ({
        ...prev,
        floors: prev.floors.map(f => {
           if (f.id !== floorId) return f;
           const areas = Array.isArray(f.areas) ? [...f.areas] : [];
           areas[areaIndex] = { ...areas[areaIndex], location_x: x, location_y: y };
           return { ...f, areas };
        })
     }));
     await updateArea(area.id, { location_x: x, location_y: y });
  };

  const addArea = async (floorId, area_name = 'Area') => {
    const floor = state.floors.find(f => f.id === floorId);
    if (!floor) return;
    const width = floor.area_width || 2;
    const depth = floor.area_depth || 2;
    const pos = findNextAvailablePosition(width, depth, floorId, 'zone');
    
    const areaData = { 
        location_x: pos.x, 
        location_y: pos.y, 
        width, 
        depth, 
        height: 3.0, 
        area_name 
    };

    try {
      const res = await fetch(`http://localhost:8000/floors/${floorId}/areas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(areaData)
      });
      const data = await res.json();
      if (res.ok) {
        setState(prev => ({
          ...prev,
          floors: prev.floors.map(f => 
            f.id === floorId 
              ? { ...f, areas: [...(Array.isArray(f.areas) ? f.areas : []), { ...areaData, id: data.id }] }
              : f
          )
        }));
      }
    } catch (error) {
      console.error("Error adding area:", error);
    }
  };

  const updateZonePosition = async (zoneId, x, y) => {
    const oldZone = state.zones.find(z => z.id === zoneId);
    if (!oldZone) return;

    const dx = x - oldZone.location_x;
    const dy = y - oldZone.location_y;

    setState(prev => ({
        ...prev,
        zones: prev.zones.map(z => z.id === zoneId ? { ...z, location_x: x, location_y: y } : z),
        shelves: prev.shelves.map(s => {
            if (s.zone_id === zoneId) {
                return {
                    ...s,
                    location_x: s.location_x + dx,
                    location_y: s.location_y + dy
                };
            }
            return s;
        })
    }));

    try {
      await fetch(`http://localhost:8000/zones/${zoneId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_x: x, location_y: y })
      });
    } catch (error) {
      console.error("Error moving zone and shelves:", error);
    }
  };

  const updateZoneDimensions = async (zoneId, width, depth) => {
    setState(prev => ({
      ...prev,
      zones: prev.zones.map(z => z.id === zoneId ? { ...z, width, depth } : z)
    }));
    await updateZone(zoneId, { width, depth });
  };

  const updateAreaDimensions = async (floorId, areaIndex, width, depth, height) => {
     const floor = state.floors.find(f => f.id === floorId);
     const area = floor?.areas?.[areaIndex];
     if (!area || !area.id) return;

    setState(prev => ({
      ...prev,
      floors: prev.floors.map(f => {
        if (f.id !== floorId) return f;
        const areas = Array.isArray(f.areas) ? [...f.areas] : [];
        if (areas[areaIndex]) {
          areas[areaIndex] = { ...areas[areaIndex], width, depth, height };
        }
        return { ...f, areas };
      })
    }));
    await updateArea(area.id, { width, depth, height });
  };

  const updateAreaProperty = async (floorId, areaIndex, property, value) => {
    const floor = state.floors.find(f => f.id === floorId);
    const area = floor?.areas?.[areaIndex];
    if (!area || !area.id) return;

    setState(prev => ({
      ...prev,
      floors: prev.floors.map(f => {
        if (f.id !== floorId) return f;
        const areas = Array.isArray(f.areas) ? [...f.areas] : [];
        if (areas[areaIndex]) {
          areas[areaIndex] = { ...areas[areaIndex], [property]: value };
        }
        return { ...f, areas };
      })
    }));
    await updateArea(area.id, { [property]: value });
  };

  const updateAreaLabel = async (floorId, areaIndex, area_name) => {
     const floor = state.floors.find(f => f.id === floorId);
     const area = floor?.areas?.[areaIndex];
     if (!area || !area.id) return;

    setState(prev => ({
      ...prev,
      floors: prev.floors.map(f => {
        if (f.id !== floorId) return f;
        const areas = Array.isArray(f.areas) ? [...f.areas] : [];
        if (areas[areaIndex]) {
          areas[areaIndex] = { ...areas[areaIndex], area_name };
        }
        return { ...f, areas };
      })
    }));
    await updateArea(area.id, { area_name });
  };

  const removeZone = async (zoneId) => {
    try {
      const res = await fetch(`http://localhost:8000/zones/${zoneId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setState(prev => ({
          ...prev,
          zones: prev.zones.filter(z => z.id !== zoneId),
          shelves: prev.shelves.filter(s => s.zone_id !== zoneId)
        }));
        return true;
      }
    } catch (error) {
      console.error("Error removing zone:", error);
    }
    return false;
  };

  const removeArea = async (floorId, areaIndex) => {
    const floor = state.floors.find(f => f.id === floorId);
    const area = floor?.areas?.[areaIndex];
    if (!area || !area.id) return;

    try {
      const res = await fetch(`http://localhost:8000/areas/${area.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setState(prev => ({
          ...prev,
          floors: prev.floors.map(f => {
            if (f.id !== floorId) return f;
            const areas = Array.isArray(f.areas) ? [...f.areas] : [];
            return {
              ...f,
              areas: areas.filter((_, idx) => idx !== areaIndex)
            };
          })
        }));
        return true;
      }
    } catch (error) {
      console.error("Error removing area:", error);
    }
    return false;
  };

  const addZone = async (floorId, zoneData) => {
    try {
      const res = await fetch(`http://localhost:8000/floors/${floorId}/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zoneData)
      });
      const data = await res.json();
      if (res.ok) {
        const newZone = { ...zoneData, id: data.id, floor_id: floorId };
        setState(prev => ({
          ...prev,
          zones: [...prev.zones, newZone]
        }));
        return newZone;
      }
    } catch (error) {
      console.error("Error adding zone:", error);
    }
  };

  const updateShelf = async (shelfId, shelfData) => {
    try {
      const res = await fetch(`http://localhost:8000/shelves/${shelfId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shelfData)
      });
      return res.ok;
    } catch (error) {
      console.error("Error updating shelf:", error);
      return false;
    }
  };

  const deleteShelf = async (shelfId) => {
    try {
      const res = await fetch(`http://localhost:8000/shelves/${shelfId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setState(prev => ({
          ...prev,
          shelves: prev.shelves.filter(s => s.id != shelfId)
        }));
        return true;
      }
    } catch (error) {
      console.error("Error deleting shelf:", error);
    }
    return false;
  };

  const updateZone = async (zoneId, zoneData) => {
    try {
      const res = await fetch(`http://localhost:8000/zones/${zoneId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zoneData)
      });
      return res.ok;
    } catch (error) {
      console.error("Error updating zone:", error);
      return false;
    }
  };

  const updateArea = async (areaId, areaData) => {
    try {
      const res = await fetch(`http://localhost:8000/areas/${areaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(areaData)
      });
      return res.ok;
    } catch (error) {
      console.error("Error updating area:", error);
      return false;
    }
  };

  const saveBulkShelves = async (zoneId, shelves) => {
    try {
        const res = await fetch(`http://localhost:8000/zones/${zoneId}/shelves/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(shelves.map(s => ({
                ...s,
                orientation_angle: s.orientation_angle || 0,
                status: s.status || 'active'
            })))
        });
        if (res.ok) {
            // Re-fetch to get IDs
            await fetchWarehouses();
            return true;
        }
    } catch (error) {
        console.error("Error saving bulk shelves:", error);
    }
    return false;
  };

  return (
    <WmsContext.Provider value={{ 
        state, setState, fetchWarehouses, findNextAvailablePosition, 
        updateShelfPosition, updateAreaPosition, updateAreaDimensions, updateAreaLabel, 
        updateAreaProperty,
        updateZonePosition, updateZoneDimensions, removeZone, addArea, removeArea, 
        addZone, saveBulkShelves, updateShelf, deleteShelf, updateZone, updateArea,
        openUpdateModal, closeUpdateModal, updateWarehouseMetadata
    }}>
      {children}
    </WmsContext.Provider>
  );
}

export function useWms() {
  return useContext(WmsContext);
}
