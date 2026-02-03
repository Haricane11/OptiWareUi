'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Truck, 
  Box, 
  LayoutGrid, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useWms } from '@/context/WmsContext';

function buildMenuItems(isConfigured) {

  const warehouseSubItems = isConfigured
    ? [
        { name: 'Update Warehouse', path: '/dashboard/warehouse?edit=1' },
        { name: 'Shelves Layout', path: '/dashboard/warehouse/layout' },
        { name: 'Shelves View', path: '/dashboard/warehouse' }
      ]
    : [
        { name: 'Create Warehouse', path: '/dashboard/warehouse' }
      ];
  return [
    {
      title: 'Dashboard',
      icon: LayoutDashboard,
      path: '/dashboard',
    },
    {
      title: 'Procurement',
      icon: ShoppingCart,
      path: '/dashboard/procurement',
      subItems: [
        { name: 'Suppliers', path: '/dashboard/procurement' },
        { name: 'Purchase Orders', path: '/dashboard/procurement' },
        { name: 'Invoices', path: '/dashboard/procurement' }
      ]
    },
    {
      title: 'Fulfillment',
      icon: Truck,
      path: '/dashboard/fulfillment',
      subItems: [
        { name: 'Sales Orders', path: '/dashboard/fulfillment' },
        { name: 'Delivery Notes', path: '/dashboard/fulfillment' }
      ]
    },
    {
      title: 'Inventory Control',
      icon: Box,
      path: '/dashboard/inventory',
      subItems: [
        { name: 'Stock Levels', path: '/dashboard/inventory' },
        { name: 'Financial Loss', path: '/dashboard/inventory/financial' },
        { name: 'Reorder Decisions', path: '/dashboard/inventory' }
      ]
    },
    {
      title: 'Warehouse Setup',
      icon: LayoutGrid,
      path: '/dashboard/warehouse',
      subItems: warehouseSubItems
    },
    {
      title: 'Staff Portal',
      icon: Box,
      path: '/staff',
    },
  ];
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const pathname = usePathname();
  const { logout } = useAuth();
  const wms = useWms();
  const menuItems = buildMenuItems(Boolean(wms?.state?.isConfigured));
 console.log(wms.state)

  const toggleMenu = (title) => {
    if (collapsed) setCollapsed(false);
    setExpandedMenus(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  return (
    <div 
      className={`h-screen bg-slate-900 text-white transition-all duration-300 flex flex-col ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        {!collapsed && <span className="text-xl font-bold text-indigo-400">OptiWare</span>}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-slate-700 transition-colors"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-2 px-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
            const isMenuOpen = expandedMenus[item.title] || isActive; // Auto-expand if active

            return (
              <li key={item.title}>
                <div 
                  onClick={() => item.subItems ? toggleMenu(item.title) : null}
                  className={`flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer ${
                    isActive && !item.subItems
                      ? 'bg-indigo-600 text-white' 
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Link href={item.path} className="flex items-center flex-1" onClick={(e) => item.subItems && e.preventDefault()}>
                    <item.icon size={20} className={collapsed ? 'mx-auto' : 'mr-3'} />
                    {!collapsed && <span className="font-medium">{item.title}</span>}
                  </Link>
                  {!collapsed && item.subItems && (
                    <ChevronDown 
                      size={16} 
                      className={`transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} 
                    />
                  )}
                </div>
                
                {/* Submenu */}
                {!collapsed && item.subItems && isMenuOpen && (
                  <ul className="mt-1 ml-4 space-y-1 border-l-2 border-slate-700 pl-2">
                    {item.subItems.map((sub, idx) => (
                      <li key={idx}>
                        <Link 
                          href={sub.path}
                          className={`block p-2 text-sm rounded hover:text-white transition-colors ${
                            pathname === sub.path ? 'text-indigo-400 font-medium' : 'text-slate-400'
                          }`}
                        >
                          {sub.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-700">
        <button 
          onClick={logout}
          className={`flex items-center w-full p-3 rounded-lg text-red-400 hover:bg-slate-800 transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut size={20} className={collapsed ? '' : 'mr-3'} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}
