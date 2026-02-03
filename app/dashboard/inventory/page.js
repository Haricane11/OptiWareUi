import { AlertCircle, Clock, Archive } from 'lucide-react';

const stockData = [
  { id: 1, name: 'Organic Milk', sku: 'OM-2024-001', category: 'Dairy', stock: 12, alert: 'expiring', expiry: '10 days' },
  { id: 2, name: 'Steel Rods', sku: 'SR-500-X', category: 'Construction', stock: 450, alert: 'overstock', expiry: '-' },
  { id: 3, name: 'Screen Pro', sku: 'SP-12-LCD', category: 'Electronics', stock: 50, alert: 'dead', expiry: '-' },
  { id: 4, name: 'Coffee Beans', sku: 'CB-AR-500', category: 'Beverage', stock: 5, alert: 'low', expiry: '180 days' },
  { id: 5, name: 'Blueberry Jam', sku: 'BJ-200-G', category: 'Pantry', stock: 8, alert: 'low', expiry: '60 days' },
  { id: 6, name: 'Laptop Stand', sku: 'LS-AL-01', category: 'Electronics', stock: 120, alert: 'normal', expiry: '-' },
];

export default function InventoryPage() {
  const lowStockCount = stockData.filter(i => i.alert === 'low').length;
  const expiringCount = stockData.filter(i => i.alert === 'expiring').length;
  const deadStockCount = stockData.filter(i => i.alert === 'dead').length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Inventory Control</h1>
        <p className="text-gray-500 mt-2">Monitor stock levels and take action on alerts.</p>
      </div>

      {/* Traffic Light Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Red: Low Stock */}
        <div className="bg-white p-6 rounded-xl border-l-4 border-red-500 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-gray-500 font-medium">Low Stock</p>
            <h2 className="text-3xl font-bold text-gray-800 mt-1">{lowStockCount}</h2>
            <p className="text-xs text-red-500 mt-2 font-medium">Critical Priority</p>
          </div>
          <div className="p-3 bg-red-50 rounded-full">
            <AlertCircle className="text-red-500" size={32} />
          </div>
        </div>

        {/* Yellow: Expiring */}
        <div className="bg-white p-6 rounded-xl border-l-4 border-yellow-500 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-gray-500 font-medium">Expiring &lt; 30 Days</p>
            <h2 className="text-3xl font-bold text-gray-800 mt-1">{expiringCount}</h2>
            <p className="text-xs text-yellow-600 mt-2 font-medium">Action Needed</p>
          </div>
          <div className="p-3 bg-yellow-50 rounded-full">
            <Clock className="text-yellow-500" size={32} />
          </div>
        </div>

        {/* Black: Dead Stock */}
        <div className="bg-white p-6 rounded-xl border-l-4 border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-gray-500 font-medium">Dead Stock</p>
            <h2 className="text-3xl font-bold text-gray-800 mt-1">{deadStockCount}</h2>
            <p className="text-xs text-gray-600 mt-2 font-medium">Capital Stuck</p>
          </div>
          <div className="p-3 bg-gray-100 rounded-full">
            <Archive className="text-gray-800" size={32} />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Stock Status</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 font-medium">Product Name</th>
                <th className="p-4 font-medium">SKU</th>
                <th className="p-4 font-medium">Category</th>
                <th className="p-4 font-medium text-right">Stock Level</th>
                <th className="p-4 font-medium">Expiry</th>
                <th className="p-4 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stockData.map((item) => {
                let rowClass = 'hover:bg-gray-50';
                let statusBadge = null;

                if (item.alert === 'low') {
                  rowClass = 'bg-red-50 hover:bg-red-100';
                  statusBadge = <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-200 text-red-800">Low Stock</span>;
                } else if (item.alert === 'expiring') {
                  rowClass = 'bg-yellow-50 hover:bg-yellow-100';
                  statusBadge = <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-200 text-yellow-800">Expiring</span>;
                } else if (item.alert === 'dead') {
                  rowClass = 'bg-gray-50 hover:bg-gray-100'; // Darker gray might be too much, kept subtle
                  statusBadge = <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-800">Dead Stock</span>;
                } else {
                    statusBadge = <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">Normal</span>;
                }

                return (
                  <tr key={item.id} className={rowClass}>
                    <td className="p-4 font-medium text-gray-900">{item.name}</td>
                    <td className="p-4 text-gray-500">{item.sku}</td>
                    <td className="p-4 text-gray-500">{item.category}</td>
                    <td className="p-4 text-right font-bold text-gray-800">{item.stock}</td>
                    <td className="p-4 text-gray-500">{item.expiry}</td>
                    <td className="p-4 text-center">{statusBadge}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
