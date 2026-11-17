'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowDownUp, ArrowLeft, ArrowRight, ArrowUp, CircleAlert, CircleCheck,
  CircleHelp, Clock3, RefreshCw, Search, TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useServiceSnapshot } from '@/hooks/useServiceSnapshot';
import { buildServiceRows, type ServiceRow } from '@/lib/services/overview';
import { cn } from '@/lib/utils';
import styles from './ServiceOverview.module.css';

type Status = ServiceRow['status'];
const states = {
  affected: { label: 'Affected', icon: CircleAlert, rank: 0 },
  degraded: { label: 'Needs attention', icon: TriangleAlert, rank: 1 },
  unknown: { label: 'Monitoring gap', icon: CircleHelp, rank: 2 },
  healthy: { label: 'Healthy', icon: CircleCheck, rank: 3 },
} satisfies Record<Status, { label: string; icon: typeof CircleAlert; rank: number }>;
const statusOptions: Status[] = ['affected', 'degraded', 'unknown', 'healthy'];
const sorts = { name: 'Service', status: 'Health', observedAt: 'Observed' } as const;
type SortKey = keyof typeof sorts;
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const dateAndTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function StateLabel({ status }: { status: Status }) {
  const { label, icon: Icon } = states[status];
  return <span className={styles.state} data-state={status}><Icon size={16} aria-hidden="true" />{label}</span>;
}

function ObservationTime({ at, full = false }: { at: string | null; full?: boolean }) {
  if (!at || !Number.isFinite(Date.parse(at))) return <span className={styles.muted}>Unavailable</span>;
  return <time dateTime={at} title={dateAndTime.format(new Date(at))}>{(full ? dateAndTime : clock).format(new Date(at))}</time>;
}

function serviceUrl(id: string) {
  return `/?service=${encodeURIComponent(id)}`;
}

export function ServiceOverview() {
  const router = useRouter();
  const requestedId = useSearchParams().get('service');
  const { snapshot, stale, unavailable, retry } = useServiceSnapshot();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'status', direction: 'asc' });
  const rows = useMemo(() => snapshot ? buildServiceRows(snapshot.update) : [], [snapshot]);
  const counts = { affected: 0, degraded: 0, unknown: 0, healthy: 0 };
  for (const row of rows) counts[row.status]++;

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => {
      return (filter === 'all' || row.status === filter) &&
        (!query || `${row.name} ${row.kind} ${row.summary}`.toLowerCase().includes(query));
    }).sort((a, b) => {
      const rank = sort.key === 'name' ? a.name.localeCompare(b.name)
        : sort.key === 'status' ? states[a.status].rank - states[b.status].rank
        : (a.observedAt ? Date.parse(a.observedAt) : 0) - (b.observedAt ? Date.parse(b.observedAt) : 0);
      return rank === 0 ? a.name.localeCompare(b.name) : sort.direction === 'asc' ? rank : -rank;
    });
  }, [rows, search, filter, sort]);

  const detail = requestedId === null ? visible[0] : rows.find(row => row.id === requestedId);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const lastRequested = useRef<string | null>(null);
  const openedFromList = useRef(false);

  useEffect(() => {
    if (requestedId !== null) {
      heading.current?.focus({ preventScroll: true });
      if (window.matchMedia('(width < 84rem)').matches) panel.current?.scrollIntoView({ block: 'start' });
    } else if (lastRequested.current) {
      const id = lastRequested.current;
      const link = Array.from(workspace.current?.querySelectorAll<HTMLAnchorElement>('[data-service-id]') ?? [])
        .find(node => node.dataset.serviceId === id && node.getClientRects().length > 0);
      (link ?? searchField.current)?.focus();
    }
    if (requestedId === null) openedFromList.current = false;
    lastRequested.current = requestedId;
  }, [requestedId]);

  function sortBy(key: SortKey) {
    setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  }

  function serviceLink(row: ServiceRow, className?: string) {
    return (
      <Link
        href={serviceUrl(row.id)}
        scroll={false}
        className={className}
        replace={requestedId !== null}
        onNavigate={() => { if (requestedId === null) openedFromList.current = true; }}
        data-service-id={row.id}
        aria-current={row.id === detail?.id ? 'true' : undefined}
      >
        <span className={styles.rowName}>{row.name}</span>
        <span className={styles.rowKind}>{row.kind}</span>
      </Link>
    );
  }

  return (
    <div className={styles.overview} data-detail-open={requestedId !== null}>
      <header className={styles.header}>
        <div>
          <h1>Overview</h1>
          <p className={styles.muted}>Service health and operational evidence</p>
        </div>
        <Link href="/overview/details" className={styles.textLink}>Infrastructure details <ArrowRight size={16} aria-hidden="true" /></Link>
      </header>

      <div className={styles.summary}>
        {snapshot && (
          <div className={styles.summaryStates} aria-label="Filter by health">
            {statusOptions.slice(0, 3).map(status => (
              <button key={status} type="button" aria-pressed={filter === status}
                onClick={() => setFilter(current => current === status ? 'all' : status)}>
                <StateLabel status={status} /><strong>{counts[status]}</strong>
              </button>
            ))}
          </div>
        )}
        <div className={styles.freshness} aria-live="polite" aria-atomic="true">
          <Clock3 size={15} aria-hidden="true" />
          {snapshot ? <>
            <span>{stale ? 'Last known readings' : snapshot.source === 'live' ? 'Live readings' : 'Polling readings'}</span>
            <ObservationTime at={snapshot.update.timestamp} />
          </> : <span>{unavailable ? 'Readings unavailable' : 'Waiting for the first reading'}</span>}
        </div>
      </div>

      <div className={styles.workspace} ref={workspace}>
        <section className={styles.directory} aria-labelledby="service-directory">
          <div className={styles.directoryHead}>
            <h2 id="service-directory">Monitored services</h2>
            {snapshot && <p className={styles.muted}>{visible.length} of {rows.length} entries</p>}
            <div className={styles.filters}>
              <label className={styles.search}>
                <span className="sr-only">Search services</span>
                <Search size={17} aria-hidden="true" />
                <Input ref={searchField} type="search" placeholder="Search services" value={search} onChange={event => setSearch(event.target.value)} />
              </label>
              <label>
                <span className="sr-only">Filter health</span>
                <select value={filter} onChange={event => setFilter(event.target.value as Status | 'all')}>
                  <option value="all">All health states</option>
                  {statusOptions.map(status => <option key={status} value={status}>{states[status].label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {!snapshot ? (
            <div className={styles.empty} role={unavailable ? 'alert' : 'status'}>
              <h3>{unavailable ? 'Monitoring readings are unavailable' : 'Loading readings'}</h3>
              <p>{unavailable ? 'The dashboard could not retrieve a reading.' : 'Waiting for the monitoring sources to respond.'}</p>
              {unavailable && <Button variant="outline" onClick={retry}><RefreshCw size={16} />Refresh readings</Button>}
            </div>
          ) : visible.length === 0 ? (
            <div className={styles.empty}>
              <h3>No matching services</h3>
              <Button variant="outline" onClick={() => { setFilter('all'); setSearch(''); searchField.current?.focus(); }}>Clear filters</Button>
            </div>
          ) : (
            <>
              <table className={styles.table} aria-label="Service health">
                <thead><tr>{(Object.entries(sorts) as [SortKey, string][]).map(([key, label]) => {
                  const active = sort.key === key;
                  const Icon = !active ? ArrowDownUp : sort.direction === 'asc' ? ArrowUp : ArrowDown;
                  return <th key={key} scope="col" aria-sort={active ? sort.direction === 'asc' ? 'ascending' : 'descending' : undefined}>
                    <button type="button" onClick={() => sortBy(key)}>{label}<Icon size={14} aria-hidden="true" /></button>
                  </th>;
                })}</tr></thead>
                <tbody>{visible.map(row => (
                  <tr key={row.id} data-selected={row.id === detail?.id}>
                    <th scope="row">{serviceLink(row, styles.rowLink)}</th>
                    <td><StateLabel status={row.status} /></td>
                    <td><ObservationTime at={row.observedAt} /></td>
                  </tr>
                ))}</tbody>
              </table>
              <ul className={styles.mobileList}>{visible.map(row => (
                <li key={row.id}>
                  <Link href={serviceUrl(row.id)} data-service-id={row.id} scroll={false} className={styles.mobileLink}
                    onNavigate={() => { openedFromList.current = true; }}>
                    <StateLabel status={row.status} />
                    <span className={styles.rowName}>{row.name}</span>
                    <ArrowRight size={18} aria-hidden="true" className={styles.mobileArrow} />
                    <span className={styles.rowKind}><span>{row.kind}</span><ObservationTime at={row.observedAt} /></span>
                  </Link>
                </li>
              ))}</ul>
            </>
          )}
        </section>

        {(detail || requestedId !== null) && (
          <section ref={panel} className={styles.detail} aria-labelledby="service-heading">
            {requestedId !== null && (
              <Link href="/" replace scroll={false} className={cn(styles.textLink, styles.back)} onNavigate={event => {
                if (openedFromList.current) {
                  event.preventDefault();
                  router.back();
                }
              }}>
                <ArrowLeft size={16} aria-hidden="true" />Back to services
              </Link>
            )}
            {detail && <StateLabel status={detail.status} />}
            <h2 id="service-heading" ref={heading} tabIndex={-1}>{detail?.name ?? 'Service evidence unavailable'}</h2>
            <p className={styles.muted}>{detail?.summary ?? (snapshot ? 'This service is absent from the current reading.' : 'Waiting for a monitoring reading.')}</p>
            {detail && (
              <>
                {stale && <p className={styles.detailMeta}>Last known evidence from the previous reading</p>}
                <div className={styles.detailMeta}>
                  <span>{detail.kind}</span><ObservationTime at={detail.observedAt} full />
                </div>
                {detail.facts.length > 0 && <dl className={styles.facts}>{detail.facts.map(fact => (
                  <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                ))}</dl>}
                {detail.events.length > 0 && (
                  <div className={styles.events}>
                    <h3>Recent evidence</h3>
                    <ol>{detail.events.map((event, index) => (
                      <li key={`${event.at}/${event.label}/${index}`}>
                        <ObservationTime at={event.at} full />
                        <strong>{event.href ? <Link href={event.href}>{event.label}</Link> : event.label}</strong>
                        {event.detail && <span className={styles.muted}>{event.detail}</span>}
                      </li>
                    ))}</ol>
                  </div>
                )}
                <Link href={detail.href} className={cn(styles.textLink, styles.action)}>{detail.action}<ArrowRight size={16} aria-hidden="true" /></Link>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
