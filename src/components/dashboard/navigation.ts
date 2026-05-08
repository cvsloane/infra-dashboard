import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  Bell,
  Bot,
  CalendarClock,
  Database,
  Home,
  LayoutDashboard,
  Rocket,
  Server,
  Users,
  ListTodo,
} from 'lucide-react'

export interface DashboardNavItem {
  name: string
  href: string
  icon: LucideIcon
}

export interface DashboardNavGroup {
  label: string
  items: DashboardNavItem[]
}

export interface KeyboardShortcutDefinition {
  id: string
  keys: string[]
  description: string
  href?: string
}

export const navGroups: DashboardNavGroup[] = [
  {
    label: 'Overview',
    items: [{ name: 'Dashboard', href: '/', icon: LayoutDashboard }],
  },
  {
    label: 'Infrastructure',
    items: [
      { name: 'Servers', href: '/servers', icon: Server },
      { name: 'Home Network', href: '/home-network', icon: Home },
      { name: 'Deployments', href: '/coolify', icon: Rocket },
      { name: 'Database', href: '/postgres', icon: Database },
      { name: 'Backups', href: '/backups', icon: Archive },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Queues', href: '/queues', icon: ListTodo },
      { name: 'Workers', href: '/workers', icon: Users },
      { name: 'Hermes', href: '/hermes', icon: Bot },
      { name: 'Cron jobs', href: '/crons', icon: CalendarClock },
      { name: 'Alerts', href: '/alerts', icon: Bell },
    ],
  },
]

export const dashboardKeyboardShortcuts: KeyboardShortcutDefinition[] = [
  { id: 'go-home', keys: ['g', 'h'], description: 'Go to overview', href: '/' },
  { id: 'go-servers', keys: ['g', 's'], description: 'Go to servers', href: '/servers' },
  { id: 'go-home-network', keys: ['g', 'n'], description: 'Go to home network', href: '/home-network' },
  { id: 'go-coolify', keys: ['g', 'c'], description: 'Go to deployments', href: '/coolify' },
  { id: 'go-postgres', keys: ['g', 'p'], description: 'Go to database', href: '/postgres' },
  { id: 'go-backups', keys: ['g', 'b'], description: 'Go to backups', href: '/backups' },
  { id: 'go-queues', keys: ['g', 'q'], description: 'Go to queues', href: '/queues' },
  { id: 'go-workers', keys: ['g', 'w'], description: 'Go to workers', href: '/workers' },
  { id: 'go-hermes', keys: ['g', 'm'], description: 'Go to Hermes fleet', href: '/hermes' },
  { id: 'go-crons', keys: ['g', 'r'], description: 'Go to scheduled jobs', href: '/crons' },
  { id: 'go-alerts', keys: ['g', 'a'], description: 'Go to alerts', href: '/alerts' },
  { id: 'show-help', keys: ['?'], description: 'Show keyboard shortcuts' },
]
