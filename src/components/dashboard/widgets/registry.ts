import type { LucideIcon } from 'lucide-react';
import { Activity, Archive, Bell, Database, Globe, Rocket, Server } from 'lucide-react';
import type { OverviewData } from '@/types/overview';
import { formatDurationShort } from '@/lib/format';

export type WidgetStatus = 'ok' | 'warning' | 'error' | 'loading' | 'unknown';

export type WidgetId =
  | 'alerts'
  | 'coolify'
  | 'deployments'
  | 'sites'
  | 'postgres'
  | 'backups'
  | 'queues'
  | 'workers';

export const MAX_VISIBLE_WIDGETS = 6;
export const PINNED_WIDGETS_STORAGE_KEY = 'infra-dashboard:pinned-widgets:v1';

export interface WidgetViewModel {
  status: WidgetStatus;
  primary: string;
  secondary?: string;
  meta?: Array<{ label: string; value: string }>;
}

export interface WidgetDefinition {
  id: WidgetId;
  label: string;
  href: string;
  icon: LucideIcon;
  getViewModel: (data: OverviewData | null) => WidgetViewModel;
}

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  {
    id: 'alerts',
    label: 'Alerts',
    href: '/alerts',
    icon: Bell,
    getViewModel: (data) => {
      if (!data) return { status: 'loading', primary: '—' };
      return {
        status: data.alerts.status,
        primary: `${data.alerts.firing} firing`,
        secondary: data.alerts.message,
        meta: [
          { label: 'Crit', value: `${data.alerts.critical}` },
          { label: 'Warn', value: `${data.alerts.warning}` },
        ],
      };
    },
  },
  {
    id: 'deployments',
    label: 'Deployments',
    href: '/coolify',
    icon: Rocket,
    getViewModel: (data) => {
      if (!data) return { status: 'loading', primary: '—' };
      const stats = data.coolify.stats || { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 };
      const status: WidgetStatus =
        data.coolify.status === 'error'
          ? 'error'
          : stats.failedToday > 0
          ? 'warning'
          : 'ok';

      const primary =
        stats.inProgress > 0
          ? `${stats.inProgress} deploying`
          : stats.queued > 0
          ? `${stats.queued} queued`
          : `${stats.finishedToday} today`;

      const secondary = stats.failedToday > 0 ? `${stats.failedToday} failed today` : undefined;

      return { status, primary, secondary };
    },
  },
  {
    id: 'sites',
    label: 'Sites',
    href: '/servers',
    icon: Globe,
    getViewModel: (data) => {
      if (!data) return { status: 'loading', primary: '—' };
      const down = data.sites.downSites.length;
      const sslSoon = data.sites.sslExpiringSoonCount;
      const primary =
        down > 0
          ? `${down} down`
          : sslSoon > 0
          ? `${sslSoon} SSL soon`
          : `${data.sites.healthySites}/${data.sites.totalSites} healthy`;

      return {
        status: data.sites.status,
        primary,
        secondary: down > 0 ? 'Sites unreachable' : sslSoon > 0 ? 'Certificates expiring' : 'All responding',
      };
    },
  },
  {
    id: 'postgres',
    label: 'PostgreSQL',
    href: '/postgres',
    icon: Database,
    getViewModel: (data) => {
      if (!data) return { status: 'loading', primary: '—' };
      const primary = `${data.postgres.connections}/${data.postgres.maxConnections}`;
      const secondary =
        data.postgres.metricsAgeSec !== null ? `Scrape ${formatDurationShort(data.postgres.metricsAgeSec)}` : undefined;
      return { status: data.postgres.status, primary, secondary };
    },
  },
  {
    id: 'backups',
    label: 'Backups',
    href: '/backups',
    icon: Archive,
    getViewModel: (data) => {
      if (!data) return { status: 'loading', primary: '—' };
      const primary = `WAL ${formatDurationShort(data.backups.walAgeSec)}`;
      const secondary = `Logical ${formatDurationShort(data.backups.logicalAgeSec)} • Base ${formatDurationShort(
        data.backups.basebackupAgeSec
      )} • Drill ${formatDurationShort(data.backups.restoreDrillAgeSec)}`;

      return { status: data.backups.status, primary, secondary };
    },
  },
  {
    id: 'queues',
    label: 'Queues',
    href: '/queues',
    icon: Activity,
    getViewModel: (data) => {
      if (!data) return { status: 'loading', primary: '—' };
      const primary =
        data.bullmq.workersDown > 0
          ? `${data.bullmq.workersDown} workers down`
          : data.bullmq.totalFailed > 0
          ? `${data.bullmq.totalFailed} failed`
          : `${data.bullmq.queues.length} queues`;
      const secondary = data.bullmq.message;
      return { status: data.bullmq.status, primary, secondary };
    },
  },
  {
    id: 'workers',
    label: 'Workers',
    href: '/workers',
    icon: Activity,
    getViewModel: (data) => {
      if (!data) return { status: 'loading', primary: '—' };
      const down = data.workerSupervisor.summary.down;
      const warn = data.workerSupervisor.summary.warning;
      const primary = down > 0 ? `${down} down` : warn > 0 ? `${warn} warn` : 'OK';
      const secondary = data.workerSupervisor.stale ? 'Stale supervisor data' : data.workerSupervisor.message;
      return { status: data.workerSupervisor.status, primary, secondary };
    },
  },
  {
    id: 'coolify',
    label: 'Coolify',
    href: '/coolify',
    icon: Server,
    getViewModel: (data) => {
      if (!data) return { status: 'loading', primary: '—' };
      const primary = `${data.coolify.applicationCount} apps`;
      const secondary = data.coolify.message;
      return { status: data.coolify.status, primary, secondary };
    },
  },
];

export const WIDGETS_BY_ID: Record<WidgetId, WidgetDefinition> = WIDGET_DEFINITIONS.reduce(
  (acc, w) => {
    acc[w.id] = w;
    return acc;
  },
  {} as Record<WidgetId, WidgetDefinition>
);

export const DEFAULT_PINNED_WIDGET_IDS: WidgetId[] = [
  'alerts',
  'sites',
  'postgres',
  'backups',
  'queues',
  'deployments',
];

export function normalizeWidgetIds(value: unknown): WidgetId[] {
  if (!Array.isArray(value)) return [];
  const out: WidgetId[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    if (!Object.prototype.hasOwnProperty.call(WIDGETS_BY_ID, item)) continue;
    const id = item as WidgetId;
    if (out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

