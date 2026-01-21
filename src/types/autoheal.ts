/**
 * AutoHEAL configuration for automatic site remediation.
 *
 * AutoHEAL monitors site health and automatically restarts/redeploys
 * applications that are down or unhealthy.
 */
export interface AutohealConfig {
  /** Whether AutoHEAL is enabled globally */
  enabled: boolean;
  /** Number of consecutive failures before triggering remediation */
  failureThreshold: number;
  /** Time window in seconds to count failures */
  failureWindowSec: number;
  /** Skip healing if a deployment is in progress */
  skipWhenDeploying: boolean;
  /** Minimum seconds between heal attempts for the same site */
  cooldownSec: number;
  /** Seconds to wait after restart before triggering redeploy */
  redeployDelaySec: number;
  /** Whether to trigger redeploy after restart */
  redeployAfterRestart: boolean;
  /** Array of application UUIDs that have AutoHEAL enabled */
  enabledSites: string[];
  /** ISO timestamp of last configuration update */
  updatedAt?: string;
}
