'use client';

import { useState } from 'react';
import { useWms } from '../context/WmsContext';
import { ArrowRight, Check, Warehouse, Layers, Map, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function WarehouseWizard({ onComplete, onClose }) {
  const { state, setState } = useWms();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(() => {


    return {
      warehouseName: (state.warehouses?.[0]?.name) || 'Main Distribution Center',
      widthM: state.warehouseDims.widthM || 30,
      depthM: state.warehouseDims.depthM || 30,
      numFloors: state.floors.length || 1,
      floorHeight: state.floorHeight || 5,
      // zones: existingZones // Removed from Wizard
    };
  });

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else finishSetup();
  };
  
  // Zone functions removed

  const finishSetup = () => {
    // 1. Update Dims
    const updatedState = { ...state };
    updatedState.warehouseDims = { widthM: formData.widthM, depthM: formData.depthM };
    updatedState.floorHeight = formData.floorHeight;
    const warehouseId = state.warehouses?.[0]?.id ?? Date.now();
    updatedState.warehouses = [
      {
        id: warehouseId,
        name: formData.warehouseName,
        location: '',
        status: 'Active',
        created_at: new Date().toISOString()
      }
    ];

    // 2. Generate Floors (Preserve existing floors to keep shelves linked)
    const newFloors = [];
    for (let i = 1; i <= formData.numFloors; i++) {
       const existingFloor = state.floors.find(f => f.level_number === i && f.warehouse_id === warehouseId);
       if (existingFloor) {
         newFloors.push(existingFloor);
       } else {
         newFloors.push({
            id: Date.now() + i, // Unique ID for new floor
            warehouse_id: warehouseId,
            name: `Floor ${i}`,
            level_number: i,
            stairs_location: { x: 0, y: 0 }
         });
       }
    }
    updatedState.floors = newFloors;
    
    // 3. Generate Zones (Preserve existing ones where possible)
    // 3. Generate Zones (Preserve existing if editing, otherwise start empty)
    // Removed Wizard Zone Logic. User must add manually.
    const newZones = state.isConfigured ? state.zones : []; 

    updatedState.zones = newZones;
    updatedState.isConfigured = true;
    setState(updatedState);
    updatedState.isConfigured = true;
    setState(updatedState);
   
    if (onComplete) onComplete();
    router.push('/dashboard/warehouse/layout');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-indigo-600 p-6 text-white shrink-0">
          <div className="flex justify-between items-start">
              <div>
                  <h2 className="text-2xl font-bold">Warehouse Setup Wizard</h2>
                  <p className="opacity-80">Let&apos;s configure your digital twin.</p>
              </div>
              {onClose && (
                  <button onClick={onClose} className="text-white/70 hover:text-white hover:bg-white/10 p-1 rounded transition-colors">
                      <X size={24} />
                  </button>
              )}
          </div>
          
          {/* Progress Steps */}
          <div className="flex items-center mt-6 gap-2 text-xs md:text-sm">
             <div className={`px-3 py-1 rounded-full ${step >= 1 ? 'bg-white text-indigo-600 font-bold' : 'bg-indigo-500 text-indigo-200'}`}>1. Dimensions</div>
             <div className="h-0.5 w-4 md:w-8 bg-indigo-400"></div>
             <div className={`px-3 py-1 rounded-full ${step >= 2 ? 'bg-white text-indigo-600 font-bold' : 'bg-indigo-500 text-indigo-200'}`}>2. Floors</div>
             <div className="h-0.5 w-4 md:w-8 bg-indigo-400"></div>
             <div className={`px-3 py-1 rounded-full ${step >= 3 ? 'bg-white text-indigo-600 font-bold' : 'bg-indigo-500 text-indigo-200'}`}>3. Review</div>
          </div>
        </div>

        {/* Body */}
        <div className="p-8 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-6">
               <div className="flex items-center gap-4 text-gray-700 mb-4">
                  <Warehouse size={32} className="text-indigo-600" />
                  <div>
                    <p className="text-lg font-bold ">Define the physical boundaries of your warehouse.</p>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Name</label>
                    <input 
                      type="text" 
                      value={formData.warehouseName}
                      onChange={e => setFormData({...formData, warehouseName: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Width (meters)</label>
                    <input 
                      type="number" 
                      value={formData.widthM}
                      onChange={e => setFormData({...formData, widthM: parseFloat(e.target.value)})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Depth (meters)</label>
                    <input 
                      type="number" 
                      value={formData.depthM}
                      onChange={e => setFormData({...formData, depthM: parseFloat(e.target.value)})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
               </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
               <div className="flex items-center gap-4 text-gray-700 mb-4">
                  <Layers size={32} className="text-indigo-600" />
                  <div>
                    <h3 className="text-lg font-bold">Vertical Space</h3>
                    <p className="text-sm text-gray-500">Configure multi-story operations.</p>
                  </div>
               </div>

               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Number of Floors</label>
                 <select 
                    value={formData.numFloors}
                    onChange={e => setFormData({...formData, numFloors: parseInt(e.target.value)})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                 >
                    <option value={1}>1 Floor</option>
                    <option value={2}>2 Floors</option>
                    <option value={3}>3 Floors</option>
                    <option value={4}>4 Floors</option>
                 </select>
               </div>

               {formData.numFloors > 1 && (
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Floor Height (meters)</label>
                    <input 
                      type="number" 
                      value={formData.floorHeight}
                      onChange={e => setFormData({...formData, floorHeight: parseFloat(e.target.value)})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">This is used for 3D stacking visualization.</p>
                 </div>
               )}
            </div>
          )}

           {/* Step 3: Review (Formerly Step 4) */}
           {step === 3 && (
             <div className="space-y-6 text-center">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4">
                   <Check size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-800">Ready to Build!</h3>
                <p className="text-gray-600">
                  We will create a <strong>{formData.widthM}m x {formData.depthM}m</strong> workspace with <strong>{formData.numFloors} floors</strong>.
                </p>
                <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm">
                    <strong>Note:</strong> You will add Zones manually in the layout designer.
                </div>
                <p className="text-sm text-gray-500 mt-6">
                  You can now drag-and-drop shelves, resize zones, and position stairs in the Visual Designer.
                </p>
             </div>
           )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-6 flex justify-between items-center border-t border-gray-100 shrink-0">
           {step > 1 ? (
             <button 
                onClick={() => setStep(step - 1)}
                className="text-gray-500 hover:text-gray-700 font-medium"
             >
                Back
             </button>
           ) : (
             <div></div>
           )}

           <button 
              onClick={handleNext}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
           >
              {step === 3 ? 'Launch Designer' : 'Next Step'}
              {step < 3 && <ArrowRight size={18} />}
           </button>
        </div>
      </div>
    </div>
  );
}
