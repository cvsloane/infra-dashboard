'use client';

import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModeToggle } from '@/components/mode-toggle';
import { RefreshCw, WifiOff, Menu, ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';

interface HeaderProps {
  isConnected?: boolean;
  lastUpdated?: string;
  lastMessageAt?: number | null;
  onRefresh?: () => void;
  onMenuClick?: () => void;
}

export function Header({ isConnected, lastUpdated, lastMessageAt, onRefresh, onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isConnected) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isConnected]);

  const messageAgeSec = useMemo(() => {
    if (!lastMessageAt) return null;
    return Math.max(0, Math.floor((nowMs - lastMessageAt) / 1000));
  }, [nowMs, lastMessageAt]);
  
  // Generate breadcrumbs
  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}`;
    // Capitalize first letter and replace hyphens
    const label = segment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
      
    return { label, href };
  });

  const isStale = useMemo(() => {
    if (!isConnected) return false;
    if (messageAgeSec === null) return false;
    return messageAgeSec > 45;
  }, [isConnected, messageAgeSec]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
        {/* Mobile menu button */}
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="md:hidden shrink-0"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}

        {/* Breadcrumbs */}
        <nav className="flex items-center text-sm font-medium text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          <Link 
            href="/" 
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4" />
            <span className="sr-only">Home</span>
          </Link>
          
          {breadcrumbs.length > 0 && (
            <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground/50 shrink-0" />
          )}

          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.href}>
                <Link
                  href={crumb.href}
                  className={`hover:text-foreground transition-colors ${
                    isLast ? 'text-foreground font-semibold pointer-events-none' : ''
                  }`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </Link>
                {!isLast && (
                  <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground/50 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {/* Connection status */}
        {isConnected !== undefined && (
          <Badge 
            variant="outline" 
            className={`gap-1.5 hidden sm:flex ${
              !isConnected
                ? 'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20'
                : isStale
                ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20'
                : 'bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20'
            }`}
          >
            {isConnected ? (
              <>
                {isStale ? (
                  <>
                    <WifiOff className="h-3 w-3" />
                    <span className="font-medium">
                      Stale{messageAgeSec !== null ? ` (${messageAgeSec}s)` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <span className="font-medium">
                      Live{messageAgeSec !== null ? ` (${messageAgeSec}s)` : ''}
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Offline</span>
              </>
            )}
          </Badge>
        )}

        {/* Last updated - hidden on mobile */}
        {lastUpdated && (
          <span className="hidden lg:inline text-xs text-muted-foreground">
            {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}

        {/* Refresh button */}
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} className="hover:bg-muted">
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        )}

        <div className="h-4 w-px bg-border hidden md:block" />

        {/* Theme Toggle */}
        <ModeToggle />
      </div>
    </header>
  );
}
