import type { BuildStage } from '@/types/deployments';

interface StagePattern {
  stage: BuildStage;
  patterns: RegExp[];
}

// Stage patterns checked in order - later stages take precedence
const STAGE_PATTERNS: StagePattern[] = [
  {
    stage: 'cloning',
    patterns: [
      /cloning/i,
      /git clone/i,
      /fetching repository/i,
      /checking out/i,
    ],
  },
  {
    stage: 'installing',
    patterns: [
      /npm install/i,
      /npm ci/i,
      /yarn install/i,
      /pnpm install/i,
      /bun install/i,
      /pip install/i,
      /installing dependencies/i,
      /added \d+ packages/i,
    ],
  },
  {
    stage: 'building',
    patterns: [
      /building/i,
      /compiling/i,
      /next build/i,
      /vite build/i,
      /docker build/i,
      /creating.*build/i,
      /webpack/i,
      /bundling/i,
    ],
  },
  {
    stage: 'deploying',
    patterns: [
      /deploying/i,
      /starting container/i,
      /container started/i,
      /pushing image/i,
      /health check/i,
      /application is running/i,
    ],
  },
];

export function detectBuildStage(logs: string | null | undefined, status: string): BuildStage {
  if (status === 'queued') return 'queued';
  if (status === 'finished') return 'completed';
  if (status === 'failed' || status === 'cancelled' || status === 'cancelled-by-user') return 'failed';

  if (!logs) return 'cloning';

  // Check stages in reverse order - last matched stage is current
  for (let i = STAGE_PATTERNS.length - 1; i >= 0; i--) {
    const { stage, patterns } = STAGE_PATTERNS[i];
    for (const pattern of patterns) {
      if (pattern.test(logs)) {
        return stage;
      }
    }
  }

  return 'cloning';
}

export function getLogPreview(logs: string | null | undefined, lineCount: number = 6): string[] {
  if (!logs) return [];

  const lines = logs.split('\n').filter(line => line.trim().length > 0);
  return lines.slice(-lineCount);
}

export function getStageIndex(stage: BuildStage): number {
  const order: BuildStage[] = ['queued', 'cloning', 'installing', 'building', 'deploying', 'completed'];
  return order.indexOf(stage);
}

export function isStageComplete(currentStage: BuildStage, checkStage: BuildStage): boolean {
  return getStageIndex(currentStage) > getStageIndex(checkStage);
}

export function isStageActive(currentStage: BuildStage, checkStage: BuildStage): boolean {
  return currentStage === checkStage;
}
