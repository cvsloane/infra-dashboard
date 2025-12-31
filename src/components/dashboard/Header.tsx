'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, LogOut, Wifi, WifiOff } from 'lucide-react';

interface HeaderProps {
  title?: string;
  isConnected?: boolean;
  lastUpdated?: string;
  onRefresh?: () => void;
}

export function Header({ title = 'Infrastructure Dashboard', isConnected, lastUpdated, onRefresh }: HeaderProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <h1 className="text-xl font-semibold">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Connection status */}
        {isConnected !== undefined && (
          <Badge variant={isConnected ? 'default' : 'destructive'} className="gap-1">
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3" />
                Live
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                Disconnected
              </>
            )}
          </Badge>
        )}

        {/* Last updated */}
        {lastUpdated && (
          <span className="text-sm text-muted-foreground">
            Updated: {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}

        {/* Refresh button */}
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}

        {/* Logout button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
