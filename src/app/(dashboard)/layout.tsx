'use client';

import { dashboardKeyboardShortcuts } from '@/components/dashboard/navigation';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';
import { KeyboardShortcutsDialog } from '@/components/ui/keyboard-shortcuts-dialog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useSSE, type DashboardUpdate } from '@/hooks/useSSE';
import { createContext, useContext, useCallback, useState } from 'react';

interface DashboardReading {
  update: DashboardUpdate;
  receivedAt: number;
}

interface DashboardContextType {
  reading: DashboardReading | null;
  data: DashboardUpdate | null;
  isConnected: boolean;
  lastUpdated?: string;
  lastMessageAt?: number | null;
  refresh: () => void;
}

const DashboardContext = createContext<DashboardContextType>({
  data: null,
  reading: null,
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [reading, setReading] = useState<DashboardReading | null>(null);
  const recordReading = useCallback((update: DashboardUpdate) => {
    const sampledAt = Date.parse(update.timestamp);
    if (update.type !== 'update' || !Number.isFinite(sampledAt)) return;
    const receivedAt = Date.now();
    setReading(previous => previous && Date.parse(previous.update.timestamp) >= sampledAt
      ? previous : { update, receivedAt });
  }, []);
  const { data, isConnected, lastMessageAt } = useSSE<DashboardUpdate>(`/api/sse/updates?key=${refreshKey}`, {
    onMessage: recordReading,
  });
  const lastUpdated = reading?.update.timestamp;

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useKeyboardShortcuts({
    enabled: !shortcutsOpen,
    onNavigate: () => {
      setSidebarOpen(false);
      setShortcutsOpen(false);
    },
    onOpenHelp: () => setShortcutsOpen(true),
  });

  return (
    <DashboardContext.Provider value={{ data, reading, isConnected, lastUpdated, lastMessageAt, refresh }}>
      <div className="flex h-screen bg-background">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            isConnected={isConnected}
            lastUpdated={lastUpdated}
            lastMessageAt={lastMessageAt}
            onRefresh={refresh}
            onMenuClick={() => setSidebarOpen(true)}
            onShortcutsClick={() => setShortcutsOpen(true)}
          />
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
            <div className="max-w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        shortcuts={dashboardKeyboardShortcuts}
      />
    </DashboardContext.Provider>
  );
}
