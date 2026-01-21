import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getAutohealConfig, saveAutohealConfig } from '@/lib/autoheal/config';
import type { AutohealConfig } from '@/types/autoheal';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getAutohealConfig();
    return NextResponse.json({ config });
  } catch (error) {
    console.error('Failed to fetch autoheal config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch autoheal config' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<AutohealConfig> | { config?: Partial<AutohealConfig> } | null;
    const input = body && typeof body === 'object' && 'config' in body
      ? (body as { config?: Partial<AutohealConfig> }).config
      : body;
    const normalized = input && typeof input === 'object' ? input as Partial<AutohealConfig> : {};
    const config = await saveAutohealConfig(normalized);
    return NextResponse.json({ config });
  } catch (error) {
    console.error('Failed to save autoheal config:', error);
    return NextResponse.json(
      { error: 'Failed to save autoheal config' },
      { status: 500 }
    );
  }
}
