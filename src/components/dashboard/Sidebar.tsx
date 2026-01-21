'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
} from 'lucide-react';

const navigation = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Deployments', href: '/coolify', icon: Rocket },
  { name: 'Database', href: '/postgres', icon: Database },
  { name: 'Queues', href: '/queues', icon: ListTodo },
  { name: 'Workers', href: '/workers', icon: Users },
  { name: 'Servers', href: '/servers', icon: Server },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const handleNavClick = () => {
    // Close sidebar on mobile after navigation
    onClose?.();
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold" onClick={handleNavClick}>
          <Settings className="h-6 w-6" />
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
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <div className="text-xs text-muted-foreground">
          Infrastructure Monitor
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar - always visible on md+ */}
      <div className="hidden md:flex h-full w-64 flex-col border-r bg-background">
        <SidebarContent />
      </div>

      {/* Mobile sidebar - drawer with backdrop */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background shadow-lg md:hidden">
            <SidebarContent />
          </div>
        </>
      )}
    </>
  );
}
