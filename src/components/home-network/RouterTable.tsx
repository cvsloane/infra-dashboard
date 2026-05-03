import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { HomeNetworkRouter } from '@/types/home-network';
import { formatMaybeNumber, formatMaybeSeconds, statusClassName } from './status-utils';

interface RouterTableProps {
  routers: HomeNetworkRouter[];
}

export function RouterTable({ routers }: RouterTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Routers and Backhaul</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">Router</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Management</th>
              <th className="py-2 pr-4 font-medium">Uptime</th>
              <th className="py-2 pr-4 font-medium">WAN/uplink</th>
              <th className="py-2 pr-4 font-medium">Internet</th>
              <th className="py-2 pr-4 font-medium">NextDNS</th>
              <th className="py-2 pr-4 font-medium">Recent events</th>
              <th className="py-2 pr-4 font-medium">Warnings</th>
            </tr>
          </thead>
          <tbody>
            {routers.map((router) => {
              const status = !router.reachable || router.nextdns?.running === false || router.wan?.up === false ? 'error' : 'ok';
              return (
                <tr key={router.hostname} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{router.hostname}</div>
                    <Badge variant="outline" className={statusClassName(status)}>
                      {router.reachable ? 'reachable' : 'unreachable'}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 capitalize">{router.role}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{router.management_ip}</td>
                  <td className="py-3 pr-4">{formatMaybeSeconds(router.uptime_sec)}</td>
                  <td className="py-3 pr-4">
                    <div>{router.wan?.up === false ? 'Down' : 'Up'}</div>
                    <div className="font-mono text-xs text-muted-foreground">{router.wan?.address || router.wan?.gateway || '—'}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <div>{router.internet_ping?.ok === false ? 'Fail' : router.internet_ping?.ok ? 'OK' : '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatMaybeNumber(router.internet_ping?.avg_ms, 'ms')} avg
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div>{router.nextdns?.running === false ? 'Down' : router.nextdns?.running ? 'Running' : '—'}</div>
                    <div className="text-xs text-muted-foreground">{router.nextdns?.message || router.nextdns?.baseline_profile || ''}</div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    {router.event_summary ? (
                      <div className="space-y-1">
                        <div>{router.event_summary.sample_size} log lines sampled</div>
                        <div>
                          assoc {router.event_summary.associations || 0} / disassoc {router.event_summary.disassociations || 0}
                        </div>
                        <div>
                          retries {router.event_summary.excessive_retries || 0} / NextDNS {router.event_summary.nextdns_reconnects || 0}
                        </div>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    {(router.warnings || []).length > 0 ? router.warnings?.join('; ') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
