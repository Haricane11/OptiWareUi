'use client';

import { useState } from 'react';
import { Truck, CheckCircle, FileText, Package, ChevronRight, User } from 'lucide-react';

const initialOrders = [
  { 
    id: 'SO-2024-1001', 
    customer: 'Tech Solutions Inc.', 
    date: '2024-01-30', 
    items: [
      { name: 'Laptop Stand', qty: 50 },
      { name: 'Screen Pro', qty: 10 }
    ],
    status: 'ordered', // ordered, note_created, picking, shipped
    total: '$3,200.00'
  },
  { 
    id: 'SO-2024-1002', 
    customer: 'Global Logistics', 
    date: '2024-01-31', 
    items: [
      { name: 'Steel Rods', qty: 200 }
    ],
    status: 'picking',
    total: '$10,000.00'
  },
   { 
    id: 'SO-2024-1003', 
    customer: 'Retail Corp', 
    date: '2024-01-31', 
    items: [
      { name: 'Organic Milk', qty: 20 },
      { name: 'Blueberry Jam', qty: 15 }
    ],
    status: 'shipped',
    total: '$450.00'
  }
];

export default function FulfillmentPage() {
  const [orders, setOrders] = useState(initialOrders);

  const updateStatus = (id, newStatus) => {
    setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Sales Orders & Fulfillment</h1>
        <p className="text-gray-500 mt-2">Manage orders and generate delivery notes.</p>
      </div>

      <div className="space-y-6">
        {orders.map((order) => (
          <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-3">
              
              {/* Left Column: Order Details */}
              <div className="p-6 border-b lg:border-b-0 lg:border-r border-gray-100 col-span-1">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{order.id}</h3>
                    <div className="flex items-center text-gray-500 text-sm mt-1">
                      <User size={14} className="mr-1" /> {order.customer}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-500">{order.date}</span>
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Items</div>
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-700">{item.name}</span>
                      <span className="font-medium text-gray-900">x{item.qty}</span>
                    </div>
                  ))}
                </div>
                
                <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                  <span className="font-bold text-gray-500">Total Value</span>
                  <span className="font-bold text-indigo-600 text-lg">{order.total}</span>
                </div>
              </div>

              {/* Right Column: Workflow & Actions */}
              <div className="p-6 col-span-1 lg:col-span-2 flex flex-col justify-center">
                
                {/* Progress Bar */}
                <div className="mb-8 relative">
                   <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -translate-y-1/2 rounded-full z-0"></div>
                   <div className="relative z-10 flex justify-between">
                      <Step 
                        label="Ordered" 
                        active={true} 
                        completed={['note_created', 'picking', 'shipped'].includes(order.status)} 
                        icon={FileText} 
                      />
                      <Step 
                        label="Delivery Note" 
                        active={['note_created', 'picking', 'shipped'].includes(order.status)} 
                        completed={['picking', 'shipped'].includes(order.status)} 
                        icon={FileText} 
                      />
                      <Step 
                        label="Picking" 
                        active={['picking', 'shipped'].includes(order.status)} 
                        completed={['shipped'].includes(order.status)} 
                        icon={Package} 
                      />
                      <Step 
                        label="Shipped" 
                        active={['shipped'].includes(order.status)} 
                        completed={order.status === 'shipped'} 
                        icon={Truck} 
                      />
                   </div>
                </div>

                {/* Action Bar */}
                <div className="flex justify-end items-center space-x-4">
                  {order.status === 'ordered' && (
                    <button 
                      onClick={() => updateStatus(order.id, 'note_created')}
                      className="flex items-center px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                    >
                      <FileText size={18} className="mr-2" /> + Create Delivery Note
                    </button>
                  )}
                  {order.status === 'note_created' && (
                    <button 
                      onClick={() => updateStatus(order.id, 'picking')}
                      className="flex items-center px-6 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200"
                    >
                      <Package size={18} className="mr-2" /> Start Picking
                    </button>
                  )}
                  {order.status === 'picking' && (
                    <button 
                      onClick={() => updateStatus(order.id, 'shipped')}
                      className="flex items-center px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-200"
                    >
                      <Truck size={18} className="mr-2" /> Mark as Shipped
                    </button>
                  )}
                  {order.status === 'shipped' && (
                    <div className="flex items-center text-green-600 font-bold px-6 py-3 bg-green-50 rounded-lg">
                      <CheckCircle size={18} className="mr-2" /> Order Completed
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Step({ label, active, completed, icon: Icon }) {
  return (
    <div className="flex flex-col items-center">
      <div 
        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors duration-300 ${
          completed ? 'bg-indigo-600 border-indigo-600 text-white' :
          active ? 'bg-white border-indigo-600 text-indigo-600' :
          'bg-white border-gray-200 text-gray-300'
        }`}
      >
        <Icon size={18} />
      </div>
      <span 
        className={`mt-2 text-xs font-medium transition-colors duration-300 ${
          active || completed ? 'text-indigo-900' : 'text-gray-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
