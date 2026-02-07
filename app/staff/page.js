'use client';

import { useState, useMemo } from 'react';
import { useWms } from '../../context/WmsContext';
import { MapPin, Box, ArrowRight, Layers, AlertCircle } from 'lucide-react';

export default function StaffPage() {
  const { state } = useWms();
  
  // Mock Staff State (In a real app, this would come from Auth/Backend)
  const [staffLocation, setStaffLocation] = useState({ floorId: 1, x: 2, y: 2 });
  
  // Mock Task
  const [currentTask, setCurrentTask] = useState({
    id: 'TASK-101',
    type: 'Put-away',
    target: {
      floorId: 2,
      zoneName: 'Zone C',
      shelfName: 'C-01', // Assuming this matches a shelf in the mock data
      shelfType: 'Bulk Floor Space',
      description: 'Place pallet of heavy machinery parts.'
    }
  });

  const [viewFloorId, setViewFloorId] = useState(staffLocation.floorId);

  // Get current floor data
  const currentFloor = state.floors.find(f => f.id === viewFloorId);
  
  // Get shelves for current floor view
  const floorZones = state.zones.filter(z => z.floor_id === viewFloorId).map(z => z.id);
  const floorShelves = state.shelves.filter(s => floorZones.includes(s.zone_id));

  // Determine navigation target
  const isTargetOnSameFloor = currentTask.target.floorId === viewFloorId;
  const navigationTarget = isTargetOnSameFloor 
    ? floorShelves.find(s => s.name === currentTask.target.shelfName) 
    : currentFloor?.stairs_location; // Target is stairs if different floor

  // Determine instruction message
  const instruction = useMemo(() => {
    if (staffLocation.floorId !== currentTask.target.floorId) {
      if (viewFloorId === staffLocation.floorId) {
        return "Navigate to the STAIRS to proceed to Floor " + currentTask.target.floorId;
      } else {
        return "Viewing Target Floor. You are currently on Floor " + staffLocation.floorId;
      }
    }
    return "Navigate to " + currentTask.target.shelfName;
  }, [staffLocation.floorId, currentTask.target.floorId, viewFloorId, currentTask.target.shelfName]);

  const handleFloorSwitch = (floorId) => {
    setViewFloorId(floorId);
    // In a real app, we might update staff location if they "moved" via stairs
    if (staffLocation.floorId !== floorId) {
        // Simulating moving floors
        setStaffLocation(prev => ({ ...prev, floorId: floorId }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 p-4 sticky top-0 z-20">
        <div className="max-w-md mx-auto flex justify-between items-center">
            <div>
                <h1 className="text-lg font-bold text-gray-800">Staff Portal</h1>
                <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                    <span className="flex items-center gap-1"><Layers size={14} /> Floor: {viewFloorId}</span>
                    <span className="text-gray-300">|</span>
                    <span className="flex items-center gap-1"><Box size={14} /> Task: {currentTask.type}</span>
                </div>
            </div>
            <div className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">
                {currentTask.id}
            </div>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full flex flex-col gap-4">
        
        {/* Task Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 border-l-4 border-l-indigo-500">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <ArrowRight className="text-indigo-500" size={20} />
                {instruction}
            </h2>
            <p className="text-gray-500 text-sm mt-2">{currentTask.target.description}</p>
            
            <div className="mt-4 flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center
                    ${currentTask.target.shelfType === 'Bulk Floor Space' ? 'bg-amber-100 text-amber-600' : 
                      currentTask.target.shelfType === 'Cold Locker' ? 'bg-cyan-100 text-cyan-600' : 'bg-gray-200 text-gray-600'
                    }`}>
                    <Box size={20} />
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-900">Target: {currentTask.target.shelfName}</p>
                    <p className="text-xs text-gray-500">{currentTask.target.shelfType} - {currentTask.target.zoneName}</p>
                </div>
            </div>

            {/* Floor Switch Prompt */}
            {!isTargetOnSameFloor && viewFloorId !== currentTask.target.floorId && (
                <button 
                    onClick={() => handleFloorSwitch(currentTask.target.floorId)}
                    className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                    Switch to Floor {currentTask.target.floorId} View
                </button>
            )}
        </div>

        {/* Map View */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex-1 min-h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-700">Floor {viewFloorId} Map</h3>
                <div className="flex gap-2">
                    {state.floors.map(f => (
                        <button 
                            key={f.id}
                            onClick={() => handleFloorSwitch(f.id)}
                            className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-all
                                ${viewFloorId === f.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                            `}
                        >
                            {f.level_number}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 relative overflow-hidden">
                {/* Grid Background */}
                <div className="absolute inset-0 opacity-10" style={{ 
                    backgroundImage: 'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)', 
                    backgroundSize: '40px 40px' 
                }}></div>

                {/* Zones */}
                {currentFloorZones.map(zone => (
                    <div 
                        key={zone.id}
                        className="absolute border flex items-start justify-start p-1"
                        style={{
                            left: `${(zone.x || 0) * 40}px`,
                            top: `${(zone.y || 0) * 40}px`,
                            width: `${(zone.width || 0) * 40}px`,
                            height: `${(zone.depth || 0) * 40}px`,
                            backgroundColor: zone.color ? `${zone.color}20` : '#e5e7eb20', // Very light opacity
                            borderColor: zone.color || '#e5e7eb',
                            zIndex: 0
                        }}
                    >
                        <span className="text-[10px] font-bold text-gray-400 select-none uppercase tracking-wider">{zone.zone_name}</span>
                    </div>
                ))}

                {/* Shelves */}
                {floorShelves.map(shelf => (
                    <div 
                        key={shelf.id}
                        className={`absolute border rounded flex items-center justify-center text-[10px] font-bold shadow-sm transition-all
                            ${shelf.name === currentTask.target.shelfName && isTargetOnSameFloor 
                                ? 'bg-indigo-500 text-white border-indigo-600 z-10 animate-pulse ring-4 ring-indigo-200' 
                                : shelf.type === 'Bulk Floor Space' 
                                    ? 'bg-amber-100 border-amber-300 text-amber-700'
                                    : 'bg-white border-gray-300 text-gray-500'
                            }
                        `}
                        style={{
                            left: `${shelf.location_x * 40}px`, // Scaling factor for demo
                            top: `${shelf.location_y * 40}px`,
                            width: `${shelf.width * 40}px`,
                            height: `${shelf.depth * 40}px`,
                        }}
                    >
                        {shelf.name}
                    </div>
                ))}

                {/* Stairs */}
                {currentFloor && (
                    <div 
                        className={`absolute flex flex-col items-center justify-center z-10
                            ${!isTargetOnSameFloor ? 'animate-bounce' : ''}
                        `}
                        style={{
                            left: `${currentFloor.stairs_location.x * 40}px`,
                            top: `${currentFloor.stairs_location.y * 40}px`,
                            width: '80px',
                            height: '80px',
                        }}
                    >
                        <div className="bg-red-500 text-white p-2 rounded-lg shadow-lg text-xs font-bold flex flex-col items-center">
                            <Layers size={16} />
                            STAIRS
                        </div>
                        {!isTargetOnSameFloor && (
                            <div className="bg-white px-2 py-1 rounded shadow text-[10px] mt-1 whitespace-nowrap font-medium text-red-600 border border-red-100">
                                Go to Floor {currentTask.target.floorId}
                            </div>
                        )}
                    </div>
                )}

                {/* Staff Marker */}
                {staffLocation.floorId === viewFloorId && (
                    <div 
                        className="absolute z-20 transition-all duration-500"
                        style={{
                            left: `${staffLocation.x * 40}px`,
                            top: `${staffLocation.y * 40}px`,
                        }}
                    >
                        <div className="relative">
                            <div className="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-md"></div>
                            <div className="absolute -top-8 -left-4 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                                You
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-indigo-500 rounded border border-indigo-600"></div> Target
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-amber-100 rounded border border-amber-300"></div> Bulk Space
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500 rounded"></div> Stairs
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}
