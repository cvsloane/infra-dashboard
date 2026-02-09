export function formatDurationShort(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) return '—';
  if (!Number.isFinite(seconds)) return '—';

  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 60 * 60) return `${Math.round(s / 60)}m`;
  if (s < 60 * 60 * 24) return `${Math.round(s / (60 * 60))}h`;
  return `${Math.round(s / (60 * 60 * 24))}d`;
}

export function formatDurationLong(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) return '—';
  if (!Number.isFinite(seconds)) return '—';

  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  const remSec = s % 60;
  if (minutes < 60) return `${minutes}m ${remSec}s`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return `${hours}h ${remMin}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

