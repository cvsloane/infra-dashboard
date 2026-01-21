'use client';

import { Sidebar } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';
import { useSSE, type DashboardUpdate } from '@/hooks/useSSE';
import { createContext, useContext, useCallback, useState } from 'react';

interface DashboardContextType {
  data: DashboardUpdate | null;
  isConnected: boolean;
  lastUpdated?: string;
  refresh: () => void;
}

const DashboardContext = createContext<DashboardContextType>({
  data: null,
  isConnected: false,
  lastUpdated: undefined,
  refresh: () => {},
});

export const useDashboard = () => useContext(DashboardContext);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data, isConnected } = useSSE<DashboardUpdate>(`/api/sse/updates?key=${refreshKey}`, {
    onError: (err) => console.error('SSE Error:', err),
  });
  const lastUpdated = data?.type === 'update' ? data.timestamp : undefined;

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <DashboardContext.Provider value={{ data, isConnected, lastUpdated, refresh }}>
      <div className="flex h-screen bg-background">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            isConnected={isConnected}
            lastUpdated={lastUpdated}
            onRefresh={refresh}
            onMenuClick={() => setSidebarOpen(true)}
          />
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
            <div className="max-w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </DashboardContext.Provider>
  );
}
