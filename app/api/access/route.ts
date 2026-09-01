import { clearSessionCookie, createSessionCookie, isPasswordValid } from '../../lib/password-auth';

const attempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 60_000;

function clientKey(request: Request): string {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

export async function POST(request: Request) {
  const key = clientKey(request);
  const now = Date.now();
  const record = attempts.get(key);
  if (record?.blockedUntil && record.blockedUntil > now) {
    return Response.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  try {
    const body = await request.json() as { password?: unknown };
    const password = typeof body.password === 'string' ? body.password : '';
    if (await isPasswordValid(password)) {
      attempts.delete(key);
      const cookie = await createSessionCookie();
      if (!cookie) return Response.json({ error: 'Password protection is not configured.' }, { status: 503 });
      return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie } });
    }
  } catch {
    // Treat malformed requests as failed attempts without exposing implementation details.
  }
  const nextCount = (record?.count || 0) + 1;
  attempts.set(key, { count: nextCount, blockedUntil: nextCount >= MAX_ATTEMPTS ? now + BLOCK_MS : 0 });
  return Response.json({ error: 'Incorrect password.' }, { status: 401 });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
