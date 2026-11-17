import { NextResponse } from 'next/server';
import { allowsAccessRequestOrigin, usesCloudflareAccess } from '@/lib/cloudflare-access';
import { clearSession } from '@/lib/auth';

export async function POST(request: Request) {
  const publicAccess = usesCloudflareAccess(request.headers, request.url);
  if (publicAccess && !allowsAccessRequestOrigin(request.headers, request.method)) {
    return NextResponse.json({ error: 'Use the dashboard to log out.' }, { status: 403 });
  }
  try {
    await clearSession();
    const redirectTo = publicAccess ? '/cdn-cgi/access/logout' : '/login';
    return NextResponse.json({ success: true, redirectTo });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}
