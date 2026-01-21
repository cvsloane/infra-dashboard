import { NextResponse } from 'next/server';
import { validatePassword, createSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    if (!validatePassword(password)) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

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
