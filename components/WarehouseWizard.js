'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWms } from '../context/WmsContext';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Check, Warehouse, Layers, Map, Plus, Trash2, X, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function WarehouseWizard({ onComplete, onClose, isUpdate = false, warehouseId = null }) {
  const { state, setState, fetchWarehouses, updateWarehouseMetadata } = useWms();
  const { user, updateUser } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  
  const initialWarehouse = useMemo(() => {
    if (isUpdate) {
      if (warehouseId) {
        return (state.warehouses || []).find(wh => wh.id == warehouseId);
      }
      return (state.warehouses || []).find(wh => wh.created_by == user?.id);
    }
    return null;
  }, [isUpdate, warehouseId, state.warehouses, user?.id]);

  const [formData, setFormData] = useState({
    warehouseName: '',
    warehouseLocation: '',
    widthM: 30,
    depthM: 30,
    heightM: 10,
    numFloors: 1,
    floorHeight: 5,
    floorWidths: [30],
    floorHeights: [10],
    floorOffsets: [0],
  });

  const [isInitialized, setIsInitialized] = useState(false);

  // One-time initialization for Update Mode
  useEffect(() => {
    if (isUpdate && initialWarehouse && !isInitialized) {
      const wh = initialWarehouse;
      const nf = (wh.floors && wh.floors.length > 0) ? wh.floors.length : 1;
      const whWidth = wh.width || 30;
      const whDepth = wh.depth || 30;
      const whHeight = wh.height || 10;
      
      setFormData({
        warehouseName: wh.name || '',
        warehouseLocation: wh.location || '',
        widthM: whWidth,
        depthM: whDepth,
        heightM: whHeight,
        numFloors: nf,
        floorHeight: state.floorHeight || 5,
        floorWidths: Array.from({ length: nf }, () => whWidth),
        floorHeights: Array.from({ length: nf }, () => whHeight / nf),
        floorOffsets: Array.from({ length: nf }, (_, i) => i * (whHeight / nf)),
      });
      setIsInitialized(true);
    }
  }, [isUpdate, initialWarehouse, isInitialized, state.floorHeight]);

  const [errors, setErrors] = useState([]);

  if (isUpdate && !initialWarehouse) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full text-center">
          <Warehouse className="mx-auto text-indigo-500 animate-pulse mb-4" size={48} />
          <h3 className="text-xl font-bold text-gray-800 mb-2">Loading Data...</h3>
          <p className="text-gray-600">Retrieving warehouse details.</p>
          <button onClick={onClose} className="mt-6 text-sm text-gray-500 hover:text-indigo-600">Cancel</button>
        </div>
      </div>
    );
  }

  // Handle Automatic Floor Distribution
  useEffect(() => {
    // If in update mode, wait until initial data is loaded to prevent overwriting with defaults
    if (isUpdate && !isInitialized) return;

    const base = formData.numFloors > 1 ? (formData.heightM || 0) / formData.numFloors : (formData.heightM || 0);
    let defaultHeight = base;
    if (!Number.isInteger(base)) {
      const nearTenth = Math.abs(base * 10 - Math.round(base * 10)) < 1e-9;
      defaultHeight = nearTenth ? Number((Math.round(base * 10) / 10).toFixed(1)) : Math.floor(base);
    }
    const nextWidths = Array.from({ length: formData.numFloors }, () => formData.widthM || 0);
    const nextHeights = Array.from({ length: formData.numFloors }, () => defaultHeight);
    const nextOffsets = Array.from({ length: formData.numFloors }, (_, i) => i * defaultHeight);
    setFormData(fd => ({ ...fd, floorWidths: nextWidths, floorHeights: nextHeights, floorOffsets: nextOffsets }));
  }, [formData.numFloors, formData.heightM, formData.widthM]);

  // Unified Validation Effect
  useEffect(() => {
    const errs = [];

    // Step 1: Basic Info Validation
    if (!formData.warehouseName?.trim()) {
      errs.push({ scope: 'step1', msg: 'Warehouse name is required.' });
    }
    if (!formData.warehouseLocation?.trim()) {
      errs.push({ scope: 'step1', msg: 'Warehouse location is required.' });
    }
    if ((formData.widthM || 0) <= 0) {
      errs.push({ scope: 'step1', msg: 'Width must be greater than 0.' });
    }
    if ((formData.depthM || 0) <= 0) {
      errs.push({ scope: 'step1', msg: 'Depth must be greater than 0.' });
    }
    if ((formData.heightM || 0) <= 0) {
      errs.push({ scope: 'step1', msg: 'Height must be greater than 0.' });
    }

    // Step 2: Per-floor height checks
    for (let i = 0; i < formData.numFloors; i++) {
      const h = parseFloat(formData.floorHeights[i] ?? 0) || 0;
      const off = parseFloat(formData.floorOffsets?.[i] ?? 0) || 0;
      if (h > (formData.heightM || 0)) {
        errs.push({ scope: 'floor', index: i, msg: `Floor ${i + 1} height exceeds warehouse height.` });
      }
      if (off + h > (formData.heightM || 0)) {
        errs.push({ scope: 'floor', index: i, msg: `Floor ${i + 1} top exceeds warehouse height.` });
      }
    }

    const totalH = (formData.floorHeights || []).reduce((s, h) => s + (parseFloat(h) || 0), 0);
    if (totalH > (formData.heightM || 0)) {
      errs.push({ scope: 'floors', msg: `Total floors height (${totalH}m) exceeds warehouse height (${formData.heightM}m)` });
    }

    setErrors(errs);
  }, [formData.floorHeights, formData.floorOffsets, formData.widthM, formData.depthM, formData.heightM, formData.numFloors, formData.warehouseName, formData.warehouseLocation]);

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else finishSetup();
  };

  const finishSetup = async () => {
    try {
      if (isUpdate && warehouseId) {
        const success = await updateWarehouseMetadata(warehouseId, {
          name: formData.warehouseName,
          location: formData.warehouseLocation,
          width: formData.widthM,
          height: formData.heightM,
          depth: formData.depthM,
          num_floors: formData.numFloors
        }, user.id);
        
        if (success) {
          if (onComplete) onComplete();
          if (onClose) onClose();
        } else {
          throw new Error("Failed to update warehouse");
        }
        return;
      }

      const floorData = Array.from({ length: formData.numFloors }, (_, i) => ({
        floor_number: i
      }));

      const warehousePayload = {
        name: formData.warehouseName,
        location: formData.warehouseLocation,
        width: formData.widthM,
        height: formData.heightM,
        depth: formData.depthM,
        status: 'Active',
        created_by: user.id,
        floors: floorData
      };

      const res = await fetch("http://localhost:8000/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(warehousePayload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to create warehouse");
      }
      const result = await res.json();
      console.log("Create result:", result);

      // Update local user state with new warehouse_id
      if (result.warehouse_id) {
        updateUser({ warehouse_id: result.warehouse_id });
      }

      // Refresh all data from backend to ensure state is in sync
      await fetchWarehouses();
      
      if (onComplete) onComplete();
      router.push('/dashboard/warehouse/layout');
    } catch (error) {
      console.error("Setup error:", error);
      alert(`Error saving warehouse: ${error.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-indigo-600 p-6 text-white shrink-0">
          <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold">{isUpdate ? 'Update Warehouse' : 'Warehouse Setup Wizard'}</h2>
                <p className="opacity-80">{isUpdate ? 'Modify your warehouse details.' : "Let's configure your digital twin."}</p>
            </div>
            {onClose && (
                <button onClick={onClose} className="text-white/70 hover:text-white hover:bg-white/10 p-1 rounded transition-colors">
                    <X size={24} />
                </button>
            )}
        </div>
        <div className="flex items-center mt-6 gap-2 text-xs md:text-sm">
           <div className={`px-3 py-1 rounded-full ${step >= 1 ? 'bg-white text-indigo-600 font-bold' : 'bg-indigo-500 text-indigo-200'}`}>1. {isUpdate ? 'Details' : 'Dimensions'}</div>
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

               {/* Inline Validation Errors for Step 1 */}
               {errors.filter(e => e.scope === 'step1').length > 0 && (
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
                   <div className="flex items-center gap-2 text-amber-800 font-bold mb-1">
                     <AlertTriangle size={18} />
                     <span>Required Information</span>
                   </div>
                   <ul className="text-sm text-amber-700 list-disc list-inside">
                     {errors.filter(e => e.scope === 'step1').map((err, idx) => (
                       <li key={idx}>{err.msg}</li>
                     ))}
                   </ul>
                 </div>
               )}

               <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Name</label>
                    <input 
                      type="text" 
                      value={formData.warehouseName}
                      onChange={e => setFormData(prev => ({...prev, warehouseName: e.target.value}))}
                      placeholder='e.g. Central Distribution Hub'
                      className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900 ${!formData.warehouseName?.trim() ? 'border-red-300 bg-red-50/30' : 'border-gray-300'}`}
                    />
                  </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Location</label>
                  <input 
                    type="text" 
                    value={formData.warehouseLocation}
                    onChange={e => setFormData(prev => ({...prev, warehouseLocation: e.target.value}))}
                    placeholder='e.g. New York, NY'
                    className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900 ${!formData.warehouseLocation?.trim() ? 'border-red-300 bg-red-50/30' : 'border-gray-300'}`}
                  />
                </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Width (meters)</label>
                    <input 
                      type="number" 
                      value={formData.widthM}
                      onChange={e => setFormData(prev => ({...prev, widthM: parseFloat(e.target.value) || 0}))}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Depth (meters)</label>
                    <input 
                      type="number" 
                      value={formData.depthM}
                      onChange={e => setFormData(prev => ({...prev, depthM: parseFloat(e.target.value) || 0}))}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Height (meters)</label>
                    <input 
                      type="number" 
                      value={formData.heightM}
                      onChange={e => setFormData(prev => ({...prev, heightM: parseFloat(e.target.value) || 0}))}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
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
                    onChange={e => setFormData(prev => ({...prev, numFloors: parseInt(e.target.value)}))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
                 >
                    {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} Floor{n > 1 ? 's' : ''}</option>)}
                 </select>
                 </div>
                {isUpdate && initialWarehouse && formData.numFloors < (initialWarehouse.floors?.length || 1) && (
                  <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r-lg">
                    <div className="flex items-center gap-2 text-amber-800 font-bold mb-1">
                      <AlertTriangle size={16} />
                      <span>Warning: Data Loss</span>
                    </div>
                    <p className="text-sm text-amber-700">
                      Reducing floor count will permanently delete all zones, areas, and shelves on the removed floors. This action cannot be undone.
                    </p>
                  </div>
                )}
                {errors.filter(e => e.scope === 'floors' || e.scope === 'floor').map((e, idx) => (
                 <div key={idx} className="text-xs text-red-600 font-medium">⚠️ {e.msg}</div>
               ))}
            </div>
          )}

          {step === 3 && (
             <div className="space-y-6 text-center">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4">
                   <Check size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-800">{isUpdate ? 'Ready to Update!' : 'Ready to Build!'}</h3>
                <p className="text-gray-600">
                  We will {isUpdate ? 'update' : 'create'} <strong>{formData.warehouseName}</strong> at <strong>{formData.warehouseLocation}</strong>.
                </p>
                <p className="text-sm text-gray-500">
                   Dimensions: {formData.widthM}m x {formData.depthM}m x {formData.heightM}m | {formData.numFloors} Floor(s)
                </p>
                <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm">
                    <strong>Note:</strong> You will add Zones manually in the layout designer.
                </div>
             </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-6 flex justify-between items-center border-t border-gray-100 shrink-0">
           {step > 1 ? (
             <button onClick={() => setStep(step - 1)} className="text-gray-500 hover:text-gray-700 font-medium">Back</button>
           ) : <div />}

           <button 
              onClick={handleNext}
              className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all ${
                errors.length > 0 
                ? 'bg-gray-300 cursor-not-allowed text-gray-500' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg'
              }`}
              disabled={errors.length > 0}
           >
               {step === 3 ? (isUpdate ? 'Update Warehouse' : 'Launch Designer') : 'Next Step'}
              {step < 3 && <ArrowRight size={18} />}
           </button>
        </div>
      </div>
    </div>
  );
}