'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CronStatusBadge } from './CronStatusBadge';
import { Server } from 'lucide-react';
import type { CronJobSummary } from '@/types/cron';

interface CronTableProps {
  jobs: CronJobSummary[];
}

const SOURCE_LABELS: Record<string, string> = {
  'user-crontab': 'user',
  'system-crontab': 'system',
  'cron.d': 'cron.d',
  'cron.hourly': 'hourly',
  'cron.daily': 'daily',
  'cron.weekly': 'weekly',
  'cron.monthly': 'monthly',
  'systemd-timer': 'timer',
  'anacron': 'anacron',
  'hermes': 'hermes',
};

function timeAgo(value?: string | null) {
  if (!value) return 'Never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return formatDistanceToNow(d, { addSuffix: true });
}

export function CronTable({ jobs }: CronTableProps) {
  const [query, setQuery] = useState('');
  const [hostFilter, setHostFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const hosts = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach((j) => s.add(j.inventory.host));
    return [...s].sort();
  }, [jobs]);

  const sources = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach((j) => s.add(j.inventory.source));
    return [...s].sort();
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (hostFilter !== 'all' && j.inventory.host !== hostFilter) return false;
      if (statusFilter !== 'all' && j.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && j.inventory.source !== sourceFilter) return false;
      if (!q) return true;
      const hay = [
        j.inventory.name,
        j.inventory.command,
        j.inventory.schedule,
        j.inventory.description || '',
        (j.inventory.tags || []).join(' '),
        j.inventory.owner || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, query, hostFilter, statusFilter, sourceFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, command, tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64"
        />
        <FilterPill
          label="Host"
          value={hostFilter}
          onChange={setHostFilter}
          options={['all', ...hosts]}
        />
        <FilterPill
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={['all', 'success', 'failure', 'running', 'missed', 'stale', 'paused', 'unknown']}
        />
        <FilterPill
          label="Source"
          value={sourceFilter}
          onChange={setSourceFilter}
          options={['all', ...sources]}
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {jobs.length} jobs
        </span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[130px]">Host</TableHead>
              <TableHead className="w-[110px]">Source</TableHead>
              <TableHead className="w-[150px]">Schedule</TableHead>
              <TableHead className="w-[160px]">Last run</TableHead>
              <TableHead className="w-[80px] text-right">Runs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  No jobs match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((j) => {
                // Hermes-managed jobs already have a rich detail page at /hermes/jobs/<id>.
                // Link there directly; only raw cron entries deep-link into /crons/[host]/[jobId].
                const href =
                  j.inventory.source === 'hermes'
                    ? `/hermes/jobs/${encodeURIComponent(j.inventory.hermes?.job_id || j.inventory.id)}`
                    : `/crons/${encodeURIComponent(j.inventory.host)}/${encodeURIComponent(j.inventory.id)}`;
                return (
                  <TableRow key={`${j.inventory.host}:${j.inventory.id}`} className="hover:bg-muted/40">
                    <TableCell>
                      <Link href={href} className="block">
                        <div className="font-medium leading-tight">{j.inventory.name}</div>
                        {j.inventory.description ? (
                          <div className="truncate text-xs text-muted-foreground" title={j.inventory.description}>
                            {j.inventory.description}
                          </div>
                        ) : (
                          <div className="truncate text-xs text-muted-foreground" title={j.inventory.command}>
                            {j.inventory.command}
                          </div>
                        )}
                        {j.inventory.tags && j.inventory.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {j.inventory.tags.slice(0, 4).map((t) => (
                              <Badge key={t} variant="outline" className="px-1 py-0 text-[10px]">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CronStatusBadge status={j.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Server className="h-3 w-3 text-muted-foreground" />
                        {j.inventory.host}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="px-1 py-0 text-[10px]">
                        {SOURCE_LABELS[j.inventory.source] || j.inventory.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        {j.inventory.schedule_display || j.inventory.schedule}
                      </code>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {timeAgo(j.latest_run?.started_at)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {j.run_count}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border bg-background px-2 py-1 text-xs"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
