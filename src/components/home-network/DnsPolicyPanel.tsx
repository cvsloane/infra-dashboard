import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { HomeNetworkDnsStatus } from '@/types/home-network';
import { statusClassName } from './status-utils';

interface DnsPolicyPanelProps {
  dns: HomeNetworkDnsStatus;
}

export function DnsPolicyPanel({ dns }: DnsPolicyPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>NextDNS and Parental Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Baseline</p>
            <p className="font-mono text-sm">{dns.baseline_profile || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Kids</p>
            <p className="font-mono text-sm">{dns.kids_profile || '—'}</p>
          </div>
        </div>
        <div className="space-y-3">
          {dns.routers.map((router) => (
            <div key={router.router_hostname} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{router.router_hostname}</div>
                <Badge variant="outline" className={statusClassName(router.running === false || router.test_ok === false ? 'error' : 'ok')}>
                  {router.running === false ? 'down' : router.test_ok === false ? 'test failed' : 'running'}
                </Badge>
              </div>
              <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>Baseline: {router.baseline_profile || '—'}</div>
                <div>Kids: {router.kids_profile || '—'}</div>
              </div>
              {(router.conditional_profiles || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {router.conditional_profiles?.map((profile) => (
                    <Badge key={`${profile.subnet}-${profile.profile}`} variant="secondary">
                      {profile.subnet}: {profile.profile}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
