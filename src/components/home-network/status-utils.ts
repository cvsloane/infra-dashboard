import type { HomeNetworkStatus } from '@/types/home-network';

export function statusClassName(status: HomeNetworkStatus): string {
  switch (status) {
    case 'ok':
      return 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300';
    case 'warning':
      return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300';
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
    default:
      return 'border-muted bg-muted/40 text-muted-foreground';
  }
}

export function formatMaybeSeconds(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '—';
  if (seconds < 120) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 120) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 72) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function formatMaybeNumber(value?: number, suffix = ''): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value)}${suffix}`;
}
