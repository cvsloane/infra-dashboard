/**
 * Coolify API Client
 *
 * Wrapper for Coolify's REST API to fetch applications, deployments, and trigger deploys.
 * All calls are server-side only - tokens are never exposed to the client.
 */

const COOLIFY_API_URL = process.env.COOLIFY_API_URL;
const COOLIFY_API_TOKEN = process.env.COOLIFY_API_TOKEN;

// Types
export interface CoolifyApplication {
  uuid: string;
  name: string;
  description?: string;
  fqdn?: string;
  git_repository?: string;
  git_branch?: string;
  git_commit_sha?: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'restarting' | 'exited' | 'degraded';
  created_at: string;
  updated_at: string;
  environment?: {
    name: string;
    project?: {
      name: string;
      uuid: string;
    };
  };
}

export interface CoolifyDeployment {
  uuid: string;
  application_uuid?: string;
  application_name?: string;
  status: 'queued' | 'in_progress' | 'finished' | 'failed' | 'cancelled' | 'cancelled-by-user';
  commit?: string;
  commit_message?: string;
  created_at: string;
  finished_at?: string;
  logs?: string;
}

export interface CoolifyProject {
  uuid: string;
  name: string;
  description?: string;
  environments?: CoolifyEnvironment[];
}

export interface CoolifyEnvironment {
  id: number;
  name: string;
  applications?: CoolifyApplication[];
}

export interface CoolifyApiResponse<T> {
  result?: T;
  data?: T;
  message?: string;
}

// API Client
class CoolifyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'CoolifyApiError';
  }
}

async function fetchCoolify<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!COOLIFY_API_URL) {
    throw new CoolifyApiError('COOLIFY_API_URL is not configured', 500);
  }
  if (!COOLIFY_API_TOKEN) {
    throw new CoolifyApiError('COOLIFY_API_TOKEN is not configured', 500);
  }

  const url = `${COOLIFY_API_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${COOLIFY_API_TOKEN}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    // Don't cache API calls in Next.js
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(text);
    } catch {
      errorData = text;
    }
    throw new CoolifyApiError(
      `Coolify API error: ${response.status} ${response.statusText}`,
      response.status,
      errorData
    );
  }

  const data = await response.json();
  // Coolify API wraps responses in 'result' or returns directly
  return (data.result ?? data) as T;
}

// Public API Functions

export async function getProjects(): Promise<CoolifyProject[]> {
  return fetchCoolify<CoolifyProject[]>('/projects');
}

export async function getApplications(): Promise<CoolifyApplication[]> {
  // Fetch all applications directly from the /applications endpoint
  return fetchCoolify<CoolifyApplication[]>('/applications');
}

export async function getApplication(uuid: string): Promise<CoolifyApplication> {
  return fetchCoolify<CoolifyApplication>(`/applications/${uuid}`);
}

export async function getDeployments(limit = 20): Promise<CoolifyDeployment[]> {
  // Coolify returns deployments sorted by created_at desc
  return fetchCoolify<CoolifyDeployment[]>(`/deployments?limit=${limit}`);
}

export async function getDeployment(uuid: string): Promise<CoolifyDeployment> {
  return fetchCoolify<CoolifyDeployment>(`/deployments/${uuid}`);
}

export async function triggerDeploy(applicationUuid: string, force = false): Promise<{ deployment_uuid: string }> {
  const response = await fetchCoolify<{ deployments: Array<{ deployment_uuid: string }> }>('/deploy', {
    method: 'POST',
    body: JSON.stringify({
      uuid: applicationUuid,
      force,
    }),
  });

  if (response.deployments?.[0]) {
    return response.deployments[0];
  }

  throw new CoolifyApiError('No deployment UUID returned', 500, response);
}

export async function cancelDeployment(deploymentUuid: string): Promise<{ status?: string; message?: string }> {
  return fetchCoolify<{ status?: string; message?: string }>(`/deployments/${deploymentUuid}/cancel`, {
    method: 'POST',
  });
}

export async function getQueueStatus(): Promise<{ jobs_pending: number; jobs_failed: number }> {
  try {
    const status = await fetchCoolify<{ jobs_pending?: number; jobs_failed?: number }>('/queue/status');
    return {
      jobs_pending: status.jobs_pending ?? 0,
      jobs_failed: status.jobs_failed ?? 0,
    };
  } catch {
    // Queue status endpoint might not be available
    return { jobs_pending: 0, jobs_failed: 0 };
  }
}

// Health check - tests connectivity to Coolify
export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    await getProjects();
    return { ok: true, message: 'Connected to Coolify API' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Coolify',
    };
  }
}
