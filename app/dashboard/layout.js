import Sidebar from '@/components/Sidebar';
import { WmsProvider } from '@/context/WmsContext';

export default function DashboardLayout({ children }) {
  return (
    <WmsProvider>
      <div className="flex h-screen bg-gray-100 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </WmsProvider>
  );
}
