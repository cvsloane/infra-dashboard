export type HomeNetworkStatus = 'ok' | 'warning' | 'error' | 'unknown';

export interface HomeNetworkPingResult {
  ok: boolean;
  loss_percent?: number;
  avg_ms?: number;
  max_ms?: number;
}

export interface HomeNetworkInterfaceStatus {
  name: string;
  up?: boolean;
  address?: string;
  gateway?: string;
  subnet?: string;
  dhcp_active?: boolean;
  details?: Record<string, unknown>;
}

export interface HomeNetworkRadio {
  router_hostname: string;
  phy?: string;
  interface?: string;
  ssid?: string;
  band?: string;
  channel?: string | number;
  width?: string;
  bssid?: string;
  tx_power_dbm?: number;
  association_count?: number;
}

export interface HomeNetworkClient {
  mac: string;
  ip?: string;
  hostname?: string;
  router_hostname?: string;
  router_role?: string;
  ssid?: string;
  band?: string;
  bssid?: string;
  signal_dbm?: number;
  rx_rate_mbps?: number;
  tx_rate_mbps?: number;
  inactive_ms?: number;
  lease_expires_at?: string;
  policy_profile?: string;
}

export interface HomeNetworkDnsRouterStatus {
  router_hostname: string;
  running?: boolean;
  baseline_profile?: string;
  kids_profile?: string;
  conditional_profiles?: Array<{
    subnet: string;
    profile: string;
  }>;
  test_ok?: boolean;
  message?: string;
}

export interface HomeNetworkDnsStatus {
  baseline_profile?: string;
  kids_profile?: string;
  routers: HomeNetworkDnsRouterStatus[];
}

export interface HomeNetworkWeakClient {
  hostname?: string;
  mac?: string;
  router_hostname?: string;
  ssid?: string;
  band?: string;
  signal_dbm?: number;
}

export interface HomeNetworkClientSummary {
  total: number;
  home_k: number;
  weak_signal: number;
  very_weak_signal: number;
  unknown_hostname: number;
  multi_ap_mac_count?: number;
  duplicate_hostname_count?: number;
  multi_ap_macs?: Array<{
    mac: string;
    hostname?: string;
    routers: string[];
    bssids: string[];
    signals: number[];
  }>;
  duplicate_hostnames?: Array<{
    hostname: string;
    macs: string[];
    routers: string[];
  }>;
  weakest: HomeNetworkWeakClient[];
}

export interface HomeNetworkRouterEventSummary {
  sample_size: number;
  associations?: number;
  disassociations?: number;
  deauthentications?: number;
  excessive_retries?: number;
  nextdns_reconnects?: number;
  dhcp_events?: number;
}

export interface HomeNetworkRouter {
  hostname: string;
  role: 'main' | 'office' | 'school' | string;
  management_ip: string;
  reachable: boolean;
  uptime_sec?: number;
  load?: number[];
  firmware?: string;
  wan?: HomeNetworkInterfaceStatus;
  lan?: HomeNetworkInterfaceStatus;
  kids?: HomeNetworkInterfaceStatus;
  internet_ping?: HomeNetworkPingResult;
  nextdns?: HomeNetworkDnsRouterStatus;
  event_summary?: HomeNetworkRouterEventSummary;
  radios?: HomeNetworkRadio[];
  warnings?: string[];
}

export interface HomeNetworkConfigSummary {
  router_hostname: string;
  generated_at: string;
  hashes?: Record<string, string>;
  ssids?: string[];
  kids_bridge_ok?: boolean;
  nextdns_running?: boolean;
  warnings?: string[];
}

export interface HomeWindowsLaptopRecord {
  label: string;
  ssh_target?: string;
  reachable: boolean;
  status: HomeNetworkStatus;
  warnings?: string[];
  collected_at?: string;
  computer_name?: string;
  username?: string;
  os?: {
    caption?: string;
    version?: string;
    last_boot?: string;
  };
  memory?: {
    free_physical_mb?: number;
    total_visible_mb?: number;
  };
  lan_ipv4_addresses?: Array<{
    InterfaceAlias?: string;
    IPAddress?: string;
    PrefixLength?: number;
  }>;
  wifi?: {
    ssid?: string;
    bssid?: string;
    radio_type?: string;
    channel?: string | number;
    rx_rate_mbps?: number;
    tx_rate_mbps?: number;
    signal?: string;
    signal_percent?: number;
  };
  openssh?: {
    service_status?: string;
    start_type?: string;
    listener_count?: number;
  };
  security?: {
    defender_realtime?: boolean;
    norton_360_present?: boolean;
    norton_family_present?: boolean;
    nextdns_running?: boolean;
  };
}

export interface HomeNetworkSnapshot {
  schema_version: 1;
  collected_at: string;
  collector_host: string;
  status: HomeNetworkStatus;
  routers: HomeNetworkRouter[];
  clients: HomeNetworkClient[];
  client_summary?: HomeNetworkClientSummary;
  dns: HomeNetworkDnsStatus;
  warnings: string[];
  monitoring_warnings?: string[];
  config_summaries?: HomeNetworkConfigSummary[];
  windows_laptops?: HomeWindowsLaptopRecord[];
}

export interface HomeNetworkHistoryEntry {
  collected_at: string;
  status: HomeNetworkStatus;
  router_count: number;
  client_count: number;
  warning_count: number;
  unreachable_router_count: number;
  weak_signal_count?: number;
  very_weak_signal_count?: number;
  multi_ap_mac_count?: number;
  duplicate_hostname_count?: number;
}

export interface HomeNetworkReadResponse {
  status: HomeNetworkStatus;
  message: string;
  checked_at: string;
  snapshot: HomeNetworkSnapshot | null;
  history: HomeNetworkHistoryEntry[];
  age_sec: number | null;
  max_age_sec: number;
  computed_warnings: string[];
  computed_monitoring_warnings?: string[];
}
