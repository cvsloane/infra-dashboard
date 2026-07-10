import { NextResponse } from 'next/server';
import { validatePassword, createSession } from '@/lib/auth';
import {
  checkLoginRateLimit,
  checkGlobalLoginRateLimit,
  getLoginClientIdentifier,
  recordLoginFailure,
  recordGlobalLoginFailure,
  resetLoginFailures,
} from '@/lib/auth-rate-limit';

export async function POST(request: Request) {
  try {
    const identifier = getLoginClientIdentifier(request);
    const [currentClientLimit, currentGlobalLimit] = await Promise.all([
      checkLoginRateLimit(identifier),
      checkGlobalLoginRateLimit(),
    ]);
    if (!currentClientLimit.allowed || !currentGlobalLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(currentClientLimit.retryAfterSec, currentGlobalLimit.retryAfterSec)),
          },
        },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const password = typeof body === 'object' && body !== null && 'password' in body
      ? body.password
      : undefined;

    if (typeof password !== 'string' || password.length === 0) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    if (!validatePassword(password)) {
      const [updatedClientLimit, updatedGlobalLimit] = await Promise.all([
        recordLoginFailure(identifier),
        recordGlobalLoginFailure(),
      ]);
      if (!updatedClientLimit.allowed || !updatedGlobalLimit.allowed) {
        return NextResponse.json(
          { error: 'Too many login attempts. Try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.max(updatedClientLimit.retryAfterSec, updatedGlobalLimit.retryAfterSec)),
            },
          },
        );
      }
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    await resetLoginFailures(identifier);

    // Create session cookie
    await createSession();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Check if password protection is enabled
  const passwordRequired = Boolean(process.env.DASHBOARD_PASSWORD);
  return NextResponse.json({ passwordRequired });
}
