'use client';

import { createContext, useContext, useState } from 'react';

const WmsContext = createContext();

// Mock Data Generator for Context
const generateMockData = () => {
  // 1. Create a Warehouse
  const warehouses = [
    {
      id: 1,
      name: 'Main Distribution Center',
      location: 'New York, NY',
      status: 'Active',
      created_at: new Date().toISOString()
    }
  ];

  // 2. Create Floors
  const floors = [
    { id: 1, warehouse_id: 1, name: 'Floor 1', level_number: 1, stairs_location: { x: 0, y: 0 } },
    { id: 2, warehouse_id: 1, name: 'Floor 2', level_number: 2, stairs_location: { x: 0, y: 0 } }
  ];

  // 3. Create Zones for the Warehouse (linked to Floors)
  const zones = [
    { id: 1, warehouse_id: 1, floor_id: 1, zone_name: 'Zone A', zone_type: 'Cold Storage' },
    { id: 2, warehouse_id: 1, floor_id: 1, zone_name: 'Zone B', zone_type: 'General' },
    { id: 3, warehouse_id: 1, floor_id: 2, zone_name: 'Zone C', zone_type: 'Bulk Storage' }
  ];

  // 4. Create Shelves (Empty initially to let user generate)
  const shelves = [];
  
  // Return empty structure, user will populate via Bulk Generator
  return {
    isConfigured: false, // New flag for Wizard
    warehouses,
    floors,
    zones,
    shelves,
    warehouseDims: {
      widthM: 30,
      depthM: 30
    },
    floorHeight: 5, // Default floor height
  };
};

export function WmsProvider({ children }) {
  const [state, setState] = useState(generateMockData());

  // Helper: Find next available position
  // Smart Creation Logic: Start at (2,2), find empty space
  const findNextAvailablePosition = (width, depth, floorId, itemType = 'shelf') => {
    let x = itemType === 'shelf' ? 2 : 0;
    let y = itemType === 'shelf' ? 2 : 0;
    const gap = 0.5;
    const warehouseWidth = state.warehouseDims.widthM;
    const warehouseDepth = state.warehouseDims.depthM;

    // Determine what to check against based on itemType
    let existingItems = [];
    if (itemType === 'shelf') {
        const floorZones = state.zones.filter(z => z.floor_id === floorId).map(z => z.id);
        existingItems = state.shelves.filter(s => floorZones.includes(s.zone_id));
    } else if (itemType === 'zone') {
        existingItems = state.zones.filter(z => z.floor_id === floorId);
    }

    // Add Stairs as Obstacle
    const currentFloor = state.floors.find(f => f.id === floorId);
    if (currentFloor && currentFloor.stairs_location) {
         existingItems.push({
             x: currentFloor.stairs_location.x,
             y: currentFloor.stairs_location.y,
             width: currentFloor.stair_width || 2,
             depth: currentFloor.stair_depth || 2
         });
    }

    // Simple grid search until no collision
    // Max attempts to prevent infinite loop
    let attempts = 0;
    while (attempts < 1000) {
      const withinBounds = (x + width <= warehouseWidth) && (y + depth <= warehouseDepth);
      if (withinBounds) {
        const collision = existingItems.some(item => {
          const itemX = item.location_x || item.x || 0;
          const itemY = item.location_y || item.y || 0;
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

      // Advance scan position
      x += width + gap;
      if (x + width > warehouseWidth) {
        x = 0;
        y += depth + gap;
        if (y + depth > warehouseDepth) {
          // No space left in current layout scan
          break;
        }
      }
      attempts++;
    }
    return { x: 0, y: 0 };
  };

  const updateShelfPosition = (shelfId, x, y) => {
    setState(prev => ({
      ...prev,
      shelves: prev.shelves.map(s => s.id === shelfId ? { ...s, location_x: x, location_y: y } : s)
    }));
  };

  const updateStairsPosition = (floorId, x, y) => {
     // Update stairs for ALL floors to keep them synced
     setState(prev => ({
        ...prev,
        floors: prev.floors.map(f => ({
           ...f,
           stairs_location: { x, y }
        }))
     }));
  };

  const updateZonePosition = (zoneId, x, y) => {
    setState(prev => {
        const oldZone = prev.zones.find(z => z.id === zoneId);
        if (!oldZone) return prev;

        const dx = x - oldZone.x;
        const dy = y - oldZone.y;

        return {
            ...prev,
            zones: prev.zones.map(z => z.id === zoneId ? { ...z, x, y } : z),
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
        };
    });
  };

  const updateZoneDimensions = (zoneId, width, depth) => {
    setState(prev => ({
      ...prev,
      zones: prev.zones.map(z => z.id === zoneId ? { ...z, width, depth } : z)
    }));
  };

  const removeZone = (zoneId) => {
    setState(prev => ({
      ...prev,
      zones: prev.zones.filter(z => z.id !== zoneId),
      // Also remove shelves in this zone? Or keep them as orphaned?
      // Let's keep them but maybe warn user. For now, just remove zone.
      // Ideally we should filter shelves: shelves: prev.shelves.filter(s => s.zone_id !== zoneId)
      // But let's keep it simple for now, maybe they want to move shelves to another zone.
    }));
  };

  return (
    <WmsContext.Provider value={{ state, setState, findNextAvailablePosition, updateShelfPosition, updateStairsPosition, updateZonePosition, updateZoneDimensions, removeZone }}>
      {children}
    </WmsContext.Provider>
  );
}

export function useWms() {
  return useContext(WmsContext);
}
