'use client';

import { useAuth } from '@/context/AuthContext';
import { User, ShieldCheck } from 'lucide-react';

export default function Home() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-indigo-900 mb-2">OptiWare</h1>
          <p className="text-xl text-indigo-600">Warehouse Management System</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
          {/* Manager Card */}
          <button
            onClick={() => login('manager')}
            className="group relative p-8 bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-indigo-100 flex flex-col items-center text-center"
          >
            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-6 group-hover:bg-indigo-600 transition-colors duration-300">
              <ShieldCheck className="w-10 h-10 text-indigo-600 group-hover:text-white transition-colors duration-300" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Manager Portal</h2>
            <p className="text-gray-500">
              Access dashboard, inventory control, procurement, and financial reports.
            </p>
            <div className="mt-6 px-6 py-2 bg-indigo-50 text-indigo-700 rounded-full font-medium group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              Enter as Manager
            </div>
          </button>

          {/* Staff Card */}
          <button
            onClick={() => login('staff')}
            className="group relative p-8 bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-blue-100 flex flex-col items-center text-center opacity-80 hover:opacity-100"
          >
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors duration-300">
              <User className="w-10 h-10 text-blue-600 group-hover:text-white transition-colors duration-300" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Staff Portal</h2>
            <p className="text-gray-500">
              Access picking lists, packing, and daily operational tasks.
            </p>
            <div className="mt-6 px-6 py-2 bg-blue-50 text-blue-700 rounded-full font-medium group-hover:bg-blue-600 group-hover:text-white transition-colors">
              Enter as Staff
            </div>
          </button>
        </div>
        
        <div className="text-center text-sm text-gray-400 mt-12">
          © {new Date().getFullYear()} OptiWare WMS. All rights reserved.
        </div>
      </div>
    </div>
  );
}
