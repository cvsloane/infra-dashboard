'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Rocket,
  Database,
  ListTodo,
  Server,
  Users,
  Settings,
  X,
  LogOut,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { name: 'Servers', href: '/servers', icon: Server },
      { name: 'Deployments', href: '/coolify', icon: Rocket },
      { name: 'Database', href: '/postgres', icon: Database },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Queues', href: '/queues', icon: ListTodo },
      { name: 'Workers', href: '/workers', icon: Users },
    ],
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface SidebarContentProps {
  pathname: string;
  onClose?: () => void;
}

function SidebarContent({ pathname, onClose }: SidebarContentProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleNavClick = () => {
    // Close sidebar on mobile after navigation
    onClose?.();
  };

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
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold" onClick={handleNavClick}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Settings className="h-5 w-5" />
          </div>
          <span>Infra Dashboard</span>
        </Link>
        {/* Close button - mobile only */}
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1 hover:bg-muted rounded">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto p-4">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-2">
            <h4 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {group.label}
            </h4>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={handleNavClick}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-secondary text-secondary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Profile / Footer */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3 rounded-lg border p-3 shadow-sm bg-card">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium">Administrator</p>
            <p className="truncate text-xs text-muted-foreground">admin@infra.local</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Log out</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar - always visible on md+ */}
      <div className="hidden md:flex h-full w-64 flex-col border-r bg-muted/10">
        <SidebarContent pathname={pathname} />
      </div>

      {/* Mobile sidebar - drawer with backdrop */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background shadow-lg md:hidden">
            <SidebarContent pathname={pathname} onClose={onClose} />
          </div>
        </>
      )}
    </>
  );
}