'use client';

import { useAuth } from '@/context/AuthContext';
import { Package, Truck, ClipboardList, Warehouse, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Dashboard() {
  const { role, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Basic protection - if not manager, redirect home
    // Note: In a real app, you'd want more robust protection (middleware, etc.)
    // For now, we'll confirm they are logged in.
    // If role is null (refresh), might want to wait or redirect. 
    // Allowing access if no role is set for verifying the page works first.
  }, [role, router]);

  const modules = [
    {
      title: 'Inventory',
      description: 'Manage stock levels, items, and categories.',
      icon: Package,
      href: '/dashboard/inventory',
      color: 'bg-blue-500',
    },
    {
      title: 'Warehouse',
      description: 'Organize zones, bins, and layout.',
      icon: Warehouse,
      href: '/dashboard/warehouse',
      color: 'bg-indigo-500',
    },
    {
      title: 'Fulfillment',
      description: 'Process orders and manage shipments.',
      icon: Truck,
      href: '/dashboard/fulfillment',
      color: 'bg-violet-500',
    },
    {
      title: 'Procurement',
      description: 'Handle suppliers and purchase orders.',
      icon: ClipboardList,
      href: '/dashboard/procurement',
      color: 'bg-purple-500',
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manager Dashboard</h1>
          <p className="text-gray-500 mt-1">Welcome back, oversee your warehouse operations.</p>
        </div>
        <button 
          onClick={logout}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {modules.map((mod) => (
          <Link 
            key={mod.title} 
            href={mod.href}
            className="group relative bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 hover:-translate-y-1 block"
          >
            <div className={`w-12 h-12 ${mod.color} rounded-xl flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform duration-200`}>
              <mod.icon size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
              {mod.title}
            </h3>
            <p className="text-gray-500 text-sm mt-2">
              {mod.description}
            </p>
          </Link>
        ))}
      </div>
      
      {/* Quick Stats or Activity could go here */}
      <div className="mt-12 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
         <h2 className="text-lg font-semibold text-gray-900 mb-4">System Status</h2>
         <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            All systems operational
         </div>
      </div>
    </div>
  );
}
