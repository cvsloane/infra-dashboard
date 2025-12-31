'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import type { AutohealConfig } from '@/types/autoheal';

interface SiteHealth {
  applicationUuid?: string;
  name: string;
  fqdn: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  httpStatus?: number;
  responseTimeMs?: number;
  error?: string;
}

interface AutohealSettingsProps {
  sites: SiteHealth[];
}

const DEFAULT_SITE_PATTERNS: Array<RegExp> = [
  /hg[-\s]?market\s?report/i,
  /hg[-\s]?websites/i,
  /hg[-\s]?seo\s?commander/i,
  /agency\s?commander/i,
];

const statusBadges: Record<SiteHealth['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } > = {
  healthy: { label: 'Healthy', variant: 'default' },
  degraded: { label: 'Degraded', variant: 'secondary' },
  down: { label: 'Down', variant: 'destructive' },
  unknown: { label: 'Unknown', variant: 'outline' },
};

function normalizeForCompare(config: AutohealConfig): AutohealConfig {
  return {
    ...config,
    enabledSites: [...config.enabledSites].sort(),
    updatedAt: undefined,
  };
}

export function AutohealSettings({ sites }: AutohealSettingsProps) {
  const [config, setConfig] = useState<AutohealConfig | null>(null);
  const [draft, setDraft] = useState<AutohealConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    let active = true;
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/autoheal/config');
        if (!res.ok) {
          throw new Error('Failed to load autoheal config');
        }
        const data = await res.json();
        if (!active) return;
        setConfig(data.config);
        setDraft(data.config);
      } catch (error) {
        console.error(error);
      }
    };

    fetchConfig();
    return () => {
      active = false;
    };
  }, []);

  const enabledCount = useMemo(() => {
    if (!draft) return 0;
    return draft.enabledSites.length;
  }, [draft]);

  const isDirty = useMemo(() => {
    if (!config || !draft) return false;
    return JSON.stringify(normalizeForCompare(config)) !== JSON.stringify(normalizeForCompare(draft));
  }, [config, draft]);

  const toggleSite = (uuid?: string) => {
    if (!uuid || !draft) return;
    setDraft({
      ...draft,
      enabledSites: draft.enabledSites.includes(uuid)
        ? draft.enabledSites.filter((id) => id !== uuid)
        : [...draft.enabledSites, uuid],
    });
  };

  const applySuggestedDefaults = () => {
    if (!draft) return;
    const suggested = sites
      .filter((site) => {
        const haystack = `${site.name} ${site.fqdn}`.toLowerCase();
        return DEFAULT_SITE_PATTERNS.some((pattern) => pattern.test(haystack));
      })
      .map((site) => site.applicationUuid)
      .filter((uuid): uuid is string => Boolean(uuid));

    setDraft({
      ...draft,
      enabledSites: Array.from(new Set(suggested)),
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setIsSaving(true);
    setSaveState('idle');
    try {
      const res = await fetch('/api/autoheal/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        throw new Error('Failed to save autoheal config');
      }
      const data = await res.json();
      setConfig(data.config);
      setDraft(data.config);
      setSaveState('saved');
    } catch (error) {
      console.error(error);
      setSaveState('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {draft?.enabled ? (
              <ShieldCheck className="h-4 w-4 text-green-500" />
            ) : (
              <ShieldOff className="h-4 w-4 text-muted-foreground" />
            )}
            AutoHEAL Controls
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{enabledCount} enabled</span>
            {draft?.updatedAt && <span>• Updated {new Date(draft.updatedAt).toLocaleString()}</span>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="text-sm font-medium">AutoHEAL Enabled</div>
                <div className="text-xs text-muted-foreground">Global toggle for automated recovery.</div>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={draft?.enabled ?? false}
                onChange={(event) =>
                  draft && setDraft({ ...draft, enabled: event.target.checked })
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Failures required</span>
                <Input
                  type="number"
                  min={1}
                  value={draft?.failureThreshold ?? ''}
                  onChange={(event) =>
                    draft &&
                    setDraft({
                      ...draft,
                      failureThreshold: Number(event.target.value || 0),
                    })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Failure window (minutes)</span>
                <Input
                  type="number"
                  min={1}
                  value={draft ? Math.max(1, Math.round(draft.failureWindowSec / 60)) : ''}
                  onChange={(event) => {
                    if (!draft) return;
                    const minutes = Number(event.target.value || 0);
                    setDraft({
                      ...draft,
                      failureWindowSec: minutes * 60,
                    });
                  }}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Safety window (minutes)</span>
                <Input
                  type="number"
                  min={0}
                  value={draft ? Math.round(draft.cooldownSec / 60) : ''}
                  onChange={(event) => {
                    if (!draft) return;
                    const minutes = Number(event.target.value || 0);
                    setDraft({
                      ...draft,
                      cooldownSec: minutes * 60,
                    });
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  Prevents rapid repeat auto-heals for the same site.
                </span>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Redeploy delay (seconds)</span>
                <Input
                  type="number"
                  min={0}
                  value={draft?.redeployDelaySec ?? ''}
                  onChange={(event) =>
                    draft &&
                    setDraft({
                      ...draft,
                      redeployDelaySec: Number(event.target.value || 0),
                    })
                  }
                />
                <span className="text-xs text-muted-foreground">
                  Wait time after restart before redeploying if still down.
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Skip while deploying</div>
                <div className="text-xs text-muted-foreground">Do not auto-heal during active deployments.</div>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={draft?.skipWhenDeploying ?? false}
                onChange={(event) =>
                  draft && setDraft({ ...draft, skipWhenDeploying: event.target.checked })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Redeploy after restart</div>
                <div className="text-xs text-muted-foreground">If still down after restart, trigger a redeploy.</div>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={draft?.redeployAfterRestart ?? false}
                onChange={(event) =>
                  draft && setDraft({ ...draft, redeployAfterRestart: event.target.checked })
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">AutoHEAL Sites</div>
              <Button
                variant="outline"
                size="sm"
                onClick={applySuggestedDefaults}
                disabled={sites.length === 0}
              >
                Apply defaults
              </Button>
            </div>

            <ScrollArea className="h-[320px] rounded-md border">
              <div className="divide-y">
                {sites.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">No sites available.</div>
                )}
                {sites.map((site) => {
                  const status = statusBadges[site.status];
                  const isEnabled = draft?.enabledSites.includes(site.applicationUuid || '');
                  return (
                    <div key={site.applicationUuid || site.fqdn} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={Boolean(isEnabled)}
                            disabled={!site.applicationUuid}
                            onChange={() => toggleSite(site.applicationUuid)}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{site.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {site.fqdn.replace('https://', '').replace('http://', '')}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={status.variant} className="text-xs">
                          {status.label}
                        </Badge>
                        {site.httpStatus && (
                          <Badge variant="outline" className="text-xs">
                            {site.httpStatus}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Changes apply immediately to the AutoHEAL worker.
            {saveState === 'saved' && <span className="ml-2 text-green-500">Saved</span>}
            {saveState === 'error' && <span className="ml-2 text-red-500">Save failed</span>}
          </div>
          <Button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
