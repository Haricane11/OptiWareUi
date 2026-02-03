'use client';

import { useState } from 'react';
import { Tag, Package, RotateCcw, Trash2, X, Check, Search, Camera, PenTool } from 'lucide-react';

// Mock Data
const initialRisks = [
  { id: 1, type: 'expiry', product: 'Organic Milk', risk: 450, recommendation: 'Liquidation Markdown', action: 'discount', days: 10 },
  { id: 2, type: 'dead', product: 'Screen Pro', risk: 2100, recommendation: 'Bundle Strategy', action: 'bundle', days: 180 },
  { id: 3, type: 'overstock', product: 'Steel Rods', risk: 5000, recommendation: 'Supplier Reversal', action: 'return', days: 0 },
  { id: 4, type: 'expiry', product: 'Yogurt Packs', risk: 120, recommendation: 'Liquidation Markdown', action: 'discount', days: 5 },
];

export default function FinancialLossPage() {
  const [risks, setRisks] = useState(initialRisks);
  const [activeModal, setActiveModal] = useState(null); // 'discount', 'bundle', 'return', 'disposal'
  const [selectedItem, setSelectedItem] = useState(null);
  
  // Recovery Session State
  const [untreatedRisk, setUntreatedRisk] = useState(7670); // Sum of initial risks
  const [projectedRecovery, setProjectedRecovery] = useState(0);
  const [finalizedLoss, setFinalizedLoss] = useState(0);

  const handleActionClick = (item, action) => {
    setSelectedItem(item);
    setActiveModal(action);
  };

  const closeModals = () => {
    setActiveModal(null);
    setSelectedItem(null);
  };

  const handleConfirmAction = (recoveryAmount, lossAmount) => {
    // Remove item from list
    setRisks(risks.filter(r => r.id !== selectedItem.id));
    
    // Update stats
    setUntreatedRisk(prev => prev - selectedItem.risk);
    setProjectedRecovery(prev => prev + recoveryAmount);
    setFinalizedLoss(prev => prev + lossAmount);

    closeModals();
  };

  return (
    <div className="relative min-h-full pb-24">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Financial Loss & Actions</h1>
        <p className="text-gray-500 mt-2">Analyze financial impact and execute recovery strategies.</p>
      </div>

      {/* Decision Grid (Impact Table) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-4 font-semibold text-gray-600">Alert</th>
              <th className="p-4 font-semibold text-gray-600">Product</th>
              <th className="p-4 font-semibold text-gray-600">Capital at Risk</th>
              <th className="p-4 font-semibold text-gray-600">Smart Recommendation</th>
              <th className="p-4 font-semibold text-gray-600">Quick Execute</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {risks.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 group">
                <td className="p-4">
                  {item.type === 'expiry' && (
                    <span className="flex items-center text-red-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-600 mr-2"></span>
                      Expiry ({item.days}d)
                    </span>
                  )}
                  {item.type === 'dead' && (
                    <span className="flex items-center text-gray-800 font-medium">
                      <span className="w-2 h-2 rounded-full bg-gray-800 mr-2"></span>
                      Dead ({item.days}d)
                    </span>
                  )}
                  {item.type === 'overstock' && (
                    <span className="flex items-center text-yellow-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>
                      Overstock
                    </span>
                  )}
                </td>
                <td className="p-4 font-medium text-gray-900">{item.product}</td>
                <td className="p-4 font-bold text-gray-800">${item.risk.toLocaleString()}</td>
                <td className="p-4 text-blue-600 font-medium">{item.recommendation}</td>
                <td className="p-4">
                  {item.action === 'discount' && (
                    <button 
                      onClick={() => handleActionClick(item, 'discount')}
                      className="flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
                    >
                      <Tag size={16} className="mr-1.5" /> Markdown
                    </button>
                  )}
                  {item.action === 'bundle' && (
                    <button 
                      onClick={() => handleActionClick(item, 'bundle')}
                      className="flex items-center px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-sm font-medium"
                    >
                      <Package size={16} className="mr-1.5" /> Build Bundle
                    </button>
                  )}
                  {item.action === 'return' && (
                    <button 
                      onClick={() => handleActionClick(item, 'return')}
                      className="flex items-center px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors text-sm font-medium"
                    >
                      <RotateCcw size={16} className="mr-1.5" /> Start Return
                    </button>
                  )}
                </td>
              </tr>
            ))}
             {risks.length === 0 && (
              <tr>
                <td colSpan="5" className="p-8 text-center text-gray-500">
                  No critical risks identified. Great job!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky Footer: Recovery Outlook */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-4 z-40 md:pl-64">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
             <h3 className="font-bold text-gray-800">Recovery Outlook</h3>
             <p className="text-sm text-gray-500">
               You have addressed ${(initialRisks.reduce((a,b) => a + b.risk, 0) - untreatedRisk).toLocaleString()} of at-risk capital. 
               Potential Recovery: <span className="text-green-600 font-bold">${projectedRecovery.toLocaleString()}</span>.
             </p>
          </div>
          <div className="flex-1 w-full max-w-md">
            <div className="h-4 rounded-full overflow-hidden flex text-xs text-white font-bold text-center">
              {untreatedRisk > 0 && (
                <div 
                  className="bg-red-500 transition-all duration-500 flex items-center justify-center" 
                  style={{ width: `${(untreatedRisk / 7670) * 100}%` }}
                  title="Untreated Risk"
                >
                  
                </div>
              )}
              {projectedRecovery > 0 && (
                <div 
                  className="bg-green-500 transition-all duration-500 flex items-center justify-center" 
                  style={{ width: `${(projectedRecovery / 7670) * 100}%` }}
                  title="Projected Recovery"
                >
                  
                </div>
              )}
              {finalizedLoss > 0 && (
                <div 
                  className="bg-gray-800 transition-all duration-500 flex items-center justify-center" 
                  style={{ width: `${(finalizedLoss / 7670) * 100}%` }}
                  title="Finalized Loss"
                >
                  
                </div>
              )}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Risk: ${untreatedRisk.toLocaleString()}</span>
              <span>Recovery: ${projectedRecovery.toLocaleString()}</span>
              <span>Loss: ${finalizedLoss.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      
      {/* Discount Modal */}
      {activeModal === 'discount' && selectedItem && (
        <DiscountModal item={selectedItem} onClose={closeModals} onConfirm={handleConfirmAction} />
      )}

      {/* Bundle Drawer */}
      {activeModal === 'bundle' && selectedItem && (
        <BundleDrawer item={selectedItem} onClose={closeModals} onConfirm={handleConfirmAction} />
      )}

      {/* Return Split View */}
      {activeModal === 'return' && selectedItem && (
        <ReturnView item={selectedItem} onClose={closeModals} onConfirm={handleConfirmAction} />
      )}

    </div>
  );
}

// --- Sub Components ---

function DiscountModal({ item, onClose, onConfirm }) {
  const [discount, setDiscount] = useState(30);
  const recovery = Math.round(item.risk * (1 - discount / 100));
  const loss = item.risk - recovery;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-800 flex items-center">
            <Tag className="mr-2 text-indigo-600" /> Apply Markdown
          </h3>
          <button onClick={onClose}><X className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="flex justify-between text-sm font-medium text-gray-500">
            <span>Product: {item.product}</span>
            <span>Original Value: ${item.risk}</span>
          </div>

          {/* Forecast Bar */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">Recovery Forecast</h4>
            <div className="h-12 flex rounded-lg overflow-hidden text-sm font-bold">
              <div className="bg-red-100 text-red-700 flex items-center justify-center" style={{ width: `${discount}%` }}>
                Loss: -${loss}
              </div>
              <div className="bg-green-100 text-green-700 flex items-center justify-center" style={{ width: `${100 - discount}%` }}>
                Recover: +${recovery}
              </div>
            </div>
          </div>

          {/* Slider */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium text-gray-700">Discount Percentage</label>
              <span className="text-lg font-bold text-indigo-600">{discount}%</span>
            </div>
            <input 
              type="range" 
              min="10" 
              max="90" 
              value={discount} 
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-700">
            Applying this strategy will shift this item from <span className="font-bold">Total Loss</span> to <span className="font-bold">Projected Recovery</span>.
          </div>
        </div>

        <div className="p-6 bg-gray-50 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
          <button 
            onClick={() => onConfirm(recovery, loss)}
            className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Confirm Markdown
          </button>
        </div>
      </div>
    </div>
  );
}

function BundleDrawer({ item, onClose, onConfirm }) {
  // Mock logic
  const recovery = Math.round(item.risk * 0.8); // Assume 80% recovery with bundle
  
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-50" onClick={onClose}></div>
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-xl font-bold text-gray-800 flex items-center">
            <Package className="mr-2 text-purple-600" /> Bundle Builder
          </h3>
          <button onClick={onClose}><X className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="flex-1 p-6 space-y-8 overflow-y-auto">
          {/* Slot 1: Dead Stock */}
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 bg-gray-50">
             <div className="text-xs font-bold text-gray-400 uppercase mb-2">Slot 1 (Dead Stock)</div>
             <div className="flex items-center">
               <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center mr-3">
                 <Archive className="text-gray-500" size={24} />
               </div>
               <div>
                 <div className="font-bold text-gray-800">{item.product}</div>
                 <div className="text-sm text-gray-500">Value: ${item.risk}</div>
               </div>
             </div>
          </div>

          {/* Plus Icon */}
          <div className="flex justify-center -my-4 relative z-10">
            <div className="bg-white p-2 rounded-full shadow-sm border border-gray-200">
               <span className="text-gray-400 font-bold">+</span>
            </div>
          </div>

          {/* Slot 2: Search */}
          <div className="border-2 border-indigo-100 rounded-xl p-4 bg-indigo-50/50">
             <div className="text-xs font-bold text-indigo-400 uppercase mb-2">Slot 2 (Fast Mover)</div>
             <div className="relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Select item to pair..." 
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
             </div>
             <div className="mt-4 space-y-2">
               <div className="text-xs font-medium text-gray-500">Suggested Pairings:</div>
               <div className="flex gap-2">
                 <button className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs hover:border-indigo-300">Microfiber Cloth</button>
                 <button className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs hover:border-indigo-300">Cleaning Spray</button>
               </div>
             </div>
          </div>

          <div className="bg-green-50 p-4 rounded-xl">
             <div className="flex justify-between items-center mb-1">
               <span className="text-sm text-green-800">Bundle Price</span>
               <span className="font-bold text-green-800">$1,850</span>
             </div>
             <div className="text-xs text-green-600">
               Est. Recovery: +${recovery}
             </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100">
          <button 
            onClick={() => onConfirm(recovery, item.risk - recovery)}
            className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200 flex items-center justify-center"
          >
            <Package size={18} className="mr-2" /> Launch Bundle
          </button>
        </div>
      </div>
    </>
  );
}

function ReturnView({ item, onClose, onConfirm }) {
  // Mock logic
  const recovery = item.risk; // Full refund assumption
  
  return (
    <div className="fixed inset-0 bg-gray-100 z-50 flex flex-col">
       <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center shadow-sm z-10">
          <h2 className="text-lg font-bold text-gray-800 flex items-center">
            <RotateCcw className="mr-2 text-orange-600" /> Return to Supplier Workspace
          </h2>
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Close</button>
       </div>

       <div className="flex-1 flex overflow-hidden">
         {/* Left: Original Invoice */}
         <div className="w-1/2 p-8 border-r border-gray-200 bg-white overflow-y-auto hidden md:block">
            <div className="max-w-xl mx-auto border border-gray-200 rounded-lg p-8 shadow-sm">
               <div className="flex justify-between mb-8">
                 <div className="text-2xl font-bold text-gray-300">INVOICE</div>
                 <div className="text-right">
                   <div className="font-bold">SteelWorks Int.</div>
                   <div className="text-sm text-gray-500">INV-2023-998</div>
                 </div>
               </div>
               <table className="w-full text-sm mb-8">
                 <thead>
                   <tr className="border-b border-gray-200">
                     <th className="text-left py-2">Item</th>
                     <th className="text-right py-2">Qty</th>
                     <th className="text-right py-2">Price</th>
                     <th className="text-right py-2">Total</th>
                   </tr>
                 </thead>
                 <tbody>
                   <tr>
                     <td className="py-2 text-gray-500">Steel Rods (SR-500-X)</td>
                     <td className="text-right py-2 text-gray-500">100</td>
                     <td className="text-right py-2 text-gray-500">$50.00</td>
                     <td className="text-right py-2 font-bold">$5,000.00</td>
                   </tr>
                 </tbody>
               </table>
               <div className="text-xs text-gray-400 text-center">
                 Verified Purchase Date: 2023-11-15
               </div>
            </div>
         </div>

         {/* Right: RMA Form */}
         <div className="w-full md:w-1/2 p-8 bg-gray-50 overflow-y-auto">
            <div className="max-w-xl mx-auto">
              <h3 className="text-xl font-bold text-gray-800 mb-6">Request Return Authorization (RMA)</h3>
              
              <div className="space-y-4 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                   <input type="text" value="SteelWorks Int." readOnly className="w-full p-2 bg-gray-50 rounded border border-gray-200" />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Return Reason</label>
                   <select className="w-full p-2 bg-white rounded border border-gray-300">
                     <option>Overstock / Inventory Adjustment</option>
                     <option>Defective</option>
                     <option>Wrong Item Sent</option>
                   </select>
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
                   <textarea className="w-full p-2 bg-white rounded border border-gray-300 h-24" placeholder="Additional details..."></textarea>
                 </div>
                 
                 <div className="pt-4 border-t border-gray-100">
                   <div className="flex justify-between items-center mb-4">
                     <span className="font-medium">Refund Amount:</span>
                     <span className="text-xl font-bold text-green-600">${item.risk.toLocaleString()}</span>
                   </div>
                   <button 
                     onClick={() => onConfirm(recovery, 0)}
                     className="w-full py-3 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 transition-colors shadow-lg shadow-orange-200"
                   >
                     Submit RMA Request
                   </button>
                 </div>
              </div>
            </div>
         </div>
       </div>
    </div>
  );
}

// Simple Archive Icon component since it was missing in import
function Archive({ size, className }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}
