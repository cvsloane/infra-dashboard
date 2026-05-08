'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Play, Pause, FileText, X } from 'lucide-react';
import type { CronInventoryRecord } from '@/types/cron';

interface CronActionsProps {
  inv: CronInventoryRecord;
  onRefresh: () => void;
}

interface LogResponse {
  excerpt: string;
  size: number;
  truncated: boolean;
  mtime: string;
  log_path: string;
}

const ACTION_DISABLED_SOURCES = new Set(['hermes']);

export function CronActions({ inv, onRefresh }: CronActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [log, setLog] = useState<LogResponse | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const runNowSupported =
    inv.source === 'systemd-timer' || inv.source === 'user-crontab';
  const pauseSupported = inv.source === 'user-crontab';
  const logSupported = !!inv.log_path;
  const hermesManaged = ACTION_DISABLED_SOURCES.has(inv.source);

  async function postAction(action: 'run-now' | 'pause' | 'enable') {
    setBusy(action);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/crons/${encodeURIComponent(inv.host)}/${encodeURIComponent(inv.id)}/actions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string; details?: unknown };
      if (!res.ok || !json.ok) {
        setError(json.error || `${action} failed (${res.status})`);
      } else {
        setInfo(`${action} succeeded`);
        onRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function fetchLog() {
    setBusy('log');
    setError(null);
    try {
      const res = await fetch(
        `/api/crons/${encodeURIComponent(inv.host)}/${encodeURIComponent(inv.id)}/log?bytes=65536`,
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error || `log fetch failed (${res.status})`);
        return;
      }
      const json = (await res.json()) as LogResponse;
      setLog(json);
      setLogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'log fetch failed');
    } finally {
      setBusy(null);
    }
  }

  if (hermesManaged) {
    return (
      <div className="rounded border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
        Hermes-managed job. Use the <code>/hermes</code> page for actions.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!runNowSupported || !!busy}
          onClick={() => postAction('run-now')}
        >
          {busy === 'run-now' ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Play className="mr-2 h-3 w-3" />
          )}
          Run now
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!pauseSupported || !!busy}
          onClick={() => postAction(inv.enabled ? 'pause' : 'enable')}
        >
          {busy === 'pause' || busy === 'enable' ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : inv.enabled ? (
            <Pause className="mr-2 h-3 w-3" />
          ) : (
            <Play className="mr-2 h-3 w-3" />
          )}
          {inv.enabled ? 'Pause' : 'Enable'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!logSupported || !!busy}
          onClick={fetchLog}
        >
          {busy === 'log' ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <FileText className="mr-2 h-3 w-3" />
          )}
          View log
        </Button>
      </div>

      {error ? (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded border border-green-500/30 bg-green-500/10 p-2 text-xs text-green-700">
          {info}
        </div>
      ) : null}

      {!runNowSupported && !pauseSupported && !logSupported ? (
        <div className="text-xs text-muted-foreground">
          No actions available for this job source.
        </div>
      ) : null}
      {!pauseSupported && inv.source !== 'user-crontab' ? (
        <div className="text-xs text-muted-foreground">
          Pause / enable currently only supported for user-crontab entries.
        </div>
      ) : null}

      {logOpen && log ? (
        <div className="rounded border bg-muted/30 p-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-muted-foreground">
              <code className="font-mono">{log.log_path}</code>{' '}
              <span>· {(log.size / 1024).toFixed(1)} KB</span>{' '}
              {log.truncated ? <span>(showing tail)</span> : null}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLogOpen(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-[11px] leading-snug">
            {log.excerpt || '(empty)'}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
