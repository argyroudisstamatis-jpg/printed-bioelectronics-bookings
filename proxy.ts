import { NextRequest, NextResponse } from 'next/server';
import { hasValidSession } from './app/lib/password-auth';

const publicPaths = new Set(['/unlock', '/api/access', '/favicon.svg', '/lab-logo.png']);

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (publicPaths.has(pathname) || pathname.startsWith('/_next/')) return NextResponse.next();
  if (await hasValidSession(request)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Password required.' }, { status: 401 });
  const unlockUrl = request.nextUrl.clone();
  unlockUrl.pathname = '/unlock';
  unlockUrl.search = `?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
  return NextResponse.redirect(unlockUrl);
}

export const config = { matcher: ['/:path*'] };
