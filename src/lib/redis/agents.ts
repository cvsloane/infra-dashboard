/**
 * Agent Run Results Client
 *
 * Reads agent run results stored by claude-agents in Redis.
 * Agents write their results using the agent-store module.
 */

import { getRedis } from './client';

// Types matching the AgentRunResult interface from claude-agents/shared
export interface AgentRunResult {
  agentName: string;
  runId: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
  summary: string;
  metrics: Record<string, number>;
  actions: string[];
  costUsd: number;
  durationMs: number;
  error?: string;
}

export interface AgentSummary {
  name: string;
  displayName: string;
  description: string;
  lastRun: AgentRunResult | null;
  schedule: string;
}

// Known agents with metadata
const KNOWN_AGENTS: Record<string, { displayName: string; description: string; schedule: string }> = {
  'infra-health': {
    displayName: 'Infrastructure Health',
    description: 'Monitors VPS servers, PM2, PostgreSQL, Tailscale',
    schedule: 'Every 15 minutes',
  },
  'db-backup': {
    displayName: 'Database Backup',
    description: 'PostgreSQL backups, verification, restore drills',
    schedule: 'Daily at 3 AM',
  },
  'queue-health': {
    displayName: 'Queue Health',
    description: 'BullMQ queue monitoring, auto-retry failed jobs',
    schedule: 'Every 5 minutes',
  },
};

/**
 * Get the latest run for a specific agent
 */
export async function getAgentLatestRun(agentName: string): Promise<AgentRunResult | null> {
  const client = getRedis();

  try {
    const latestId = await client.get(`agent:latest:${agentName}`);
    if (!latestId) return null;

    const data = await client.get(`agent:run:${agentName}:${latestId}`);
    if (!data) return null;

    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to get latest run for ${agentName}:`, error);
    return null;
  }
}

/**
 * Get run history for an agent
 */
export async function getAgentRunHistory(
  agentName: string,
  limit: number = 10
): Promise<AgentRunResult[]> {
  const client = getRedis();

  try {
    const runIds = await client.lrange(`agent:history:${agentName}`, 0, limit - 1);
    if (!runIds.length) return [];

    const runs: AgentRunResult[] = [];

    for (const runId of runIds) {
      const data = await client.get(`agent:run:${agentName}:${runId}`);
      if (data) {
        runs.push(JSON.parse(data));
      }
    }

    return runs;
  } catch (error) {
    console.error(`Failed to get run history for ${agentName}:`, error);
    return [];
  }
}

/**
 * Get summaries for all known agents
 */
export async function getAllAgentSummaries(): Promise<AgentSummary[]> {
  const summaries: AgentSummary[] = [];

  for (const [name, meta] of Object.entries(KNOWN_AGENTS)) {
    const lastRun = await getAgentLatestRun(name);
    summaries.push({
      name,
      displayName: meta.displayName,
      description: meta.description,
      schedule: meta.schedule,
      lastRun,
    });
  }

  return summaries;
}

/**
 * Get aggregate stats for all agents
 */
export async function getAgentStats(): Promise<{
  totalAgents: number;
  healthyAgents: number;
  warningAgents: number;
  errorAgents: number;
  lastRunTime: string | null;
  totalCostToday: number;
}> {
  const summaries = await getAllAgentSummaries();

  let healthyAgents = 0;
  let warningAgents = 0;
  let errorAgents = 0;
  let lastRunTime: string | null = null;
  let totalCostToday = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const summary of summaries) {
    if (!summary.lastRun) {
      continue;
    }

    // Count by status
    switch (summary.lastRun.status) {
      case 'success':
        healthyAgents++;
        break;
      case 'warning':
        warningAgents++;
        break;
      case 'error':
        errorAgents++;
        break;
    }

    // Track most recent run
    if (!lastRunTime || summary.lastRun.timestamp > lastRunTime) {
      lastRunTime = summary.lastRun.timestamp;
    }

    // Sum cost for today's runs
    const runDate = new Date(summary.lastRun.timestamp);
    if (runDate >= today) {
      totalCostToday += summary.lastRun.costUsd;
    }
  }

  return {
    totalAgents: summaries.length,
    healthyAgents,
    warningAgents,
    errorAgents,
    lastRunTime,
    totalCostToday,
  };
}
