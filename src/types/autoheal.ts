export interface AutohealConfig {
  enabled: boolean;
  failureThreshold: number;
  failureWindowSec: number;
  skipWhenDeploying: boolean;
  cooldownSec: number;
  redeployDelaySec: number;
  redeployAfterRestart: boolean;
  enabledSites: string[];
  updatedAt?: string;
}
