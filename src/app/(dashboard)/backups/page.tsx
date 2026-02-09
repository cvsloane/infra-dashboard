'use client';

import { useEffect, useState } from 'react';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDurationLong, formatDurationShort } from '@/lib/format';
import { Archive } from 'lucide-react';

type BackupStatus = 'ok' | 'warning' | 'error' | 'unknown';

interface BackupsResponse {
  status: BackupStatus;
  message: string;
  wal: { status: BackupStatus; ageSec: number | null };
  logical: { status: BackupStatus; ageSec: number | null; bytes: number | null };
  basebackup: { status: BackupStatus; ageSec: number | null; checkedAgeSec: number | null };
  restoreDrill: { status: BackupStatus; ageSec: number | null };
  thresholds: {
    walWarnSec: number;
    walErrorSec: number;
    logicalWarnSec: number;
    logicalErrorSec: number;
    restoreDrillWarnSec: number;
    restoreDrillErrorSec: number;
    basebackupWarnSec: number;
    basebackupErrorSec: number;
    basebackupCheckedWarnSec: number;
    basebackupCheckedErrorSec: number;
  };
  _raw?: unknown;
}

function statusBadge(status: BackupStatus) {
  if (status === 'error') return <Badge variant="destructive">error</Badge>;
  if (status === 'warning') {
    return (
      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/25">
        warning
      </Badge>
    );
  }
  if (status === 'ok') {
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/25">
        ok
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      unknown
    </Badge>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '—';
  const b = Math.max(0, bytes);
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  if (b >= gb) return `${(b / gb).toFixed(2)} GB`;
  if (b >= mb) return `${(b / mb).toFixed(0)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

export default function BackupsPage() {
  const [data, setData] = useState<BackupsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/postgres/backups');
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error('Failed to fetch backups:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Backups</h1>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Backups</h1>
        <p className="text-sm text-muted-foreground">Freshness for logical dumps, WAL archive, base backups, and restore drills.</p>
      </div>

      <StatusCard
        title="DB Backups"
        status={data?.status || 'unknown'}
        message={data?.message || 'No backup metrics'}
        icon={Archive}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backup Freshness</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Warn</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Logical</TableCell>
                <TableCell>{statusBadge(data?.logical.status || 'unknown')}</TableCell>
                <TableCell>
                  <span title={`${data?.logical.ageSec ?? '—'}s`}>{formatDurationShort(data?.logical.ageSec)}</span>
                  {data?.logical.bytes != null && (
                    <span className="ml-2 text-xs text-muted-foreground">({formatBytes(data?.logical.bytes ?? null)})</span>
                  )}
                </TableCell>
                <TableCell>{formatDurationLong(data?.thresholds.logicalWarnSec)}</TableCell>
                <TableCell>{formatDurationLong(data?.thresholds.logicalErrorSec)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">WAL archive</TableCell>
                <TableCell>{statusBadge(data?.wal.status || 'unknown')}</TableCell>
                <TableCell>
                  <span title={`${data?.wal.ageSec ?? '—'}s`}>{formatDurationShort(data?.wal.ageSec)}</span>
                </TableCell>
                <TableCell>{formatDurationLong(data?.thresholds.walWarnSec)}</TableCell>
                <TableCell>{formatDurationLong(data?.thresholds.walErrorSec)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Base backup</TableCell>
                <TableCell>{statusBadge(data?.basebackup.status || 'unknown')}</TableCell>
                <TableCell>
                  <span title={`${data?.basebackup.ageSec ?? '—'}s`}>{formatDurationShort(data?.basebackup.ageSec)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    chk {formatDurationShort(data?.basebackup.checkedAgeSec)}
                  </span>
                </TableCell>
                <TableCell>
                  {formatDurationLong(data?.thresholds.basebackupWarnSec)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    chk {formatDurationLong(data?.thresholds.basebackupCheckedWarnSec)}
                  </span>
                </TableCell>
                <TableCell>
                  {formatDurationLong(data?.thresholds.basebackupErrorSec)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    chk {formatDurationLong(data?.thresholds.basebackupCheckedErrorSec)}
                  </span>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Restore drill</TableCell>
                <TableCell>{statusBadge(data?.restoreDrill.status || 'unknown')}</TableCell>
                <TableCell>
                  <span title={`${data?.restoreDrill.ageSec ?? '—'}s`}>{formatDurationShort(data?.restoreDrill.ageSec)}</span>
                </TableCell>
                <TableCell>{formatDurationLong(data?.thresholds.restoreDrillWarnSec)}</TableCell>
                <TableCell>{formatDurationLong(data?.thresholds.restoreDrillErrorSec)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Raw metrics
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-muted/20 p-3 text-xs">
              {JSON.stringify(data?._raw ?? null, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
