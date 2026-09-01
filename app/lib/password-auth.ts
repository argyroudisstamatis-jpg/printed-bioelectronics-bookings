import { env } from 'cloudflare:workers';

const PASSWORD_HASH_KEY = 'LAB_CALENDAR_PASSWORD_HASH';
const PASSWORD_SALT_KEY = 'LAB_CALENDAR_PASSWORD_SALT';
const PASSWORD_VALUE_KEY = 'LAB_CALENDAR_PASSWORD';
const SESSION_SECRET_KEY = 'LAB_CALENDAR_SESSION_SECRET';
const SESSION_COOKIE = 'lab_calendar_session';
const PASSWORD_ITERATIONS = 120_000;
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function runtimeValue(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env?.[name]) return process.env[name];
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  return runtimeEnv[name];
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePasswordHash(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

async function sign(value: string): Promise<string | null> {
  const secret = runtimeValue(SESSION_SECRET_KEY);
  if (!secret) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(signature));
}

export async function isPasswordValid(password: string): Promise<boolean> {
  const configuredPassword = runtimeValue(PASSWORD_VALUE_KEY);
  if (configuredPassword) return constantTimeEqual(new TextEncoder().encode(password), new TextEncoder().encode(configuredPassword));
  const expectedHash = runtimeValue(PASSWORD_HASH_KEY);
  const salt = runtimeValue(PASSWORD_SALT_KEY);
  if (!expectedHash || !salt) return false;
  try {
    const actualHash = await derivePasswordHash(password, decodeBase64Url(salt));
    return constantTimeEqual(actualHash, decodeBase64Url(expectedHash));
  } catch {
    return false;
  }
}

export async function createSessionCookie(): Promise<string | null> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `v1.${expiresAt}`;
  const signature = await sign(payload);
  if (!signature) return null;
  return `${SESSION_COOKIE}=${encodeBase64Url(new TextEncoder().encode(`${payload}.${signature}`))}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function hasValidSession(request: Request): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookie = cookieHeader.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return false;
  try {
    const decoded = new TextDecoder().decode(decodeBase64Url(cookie.slice(SESSION_COOKIE.length + 1)));
    const [version, expiry, signature] = decoded.split('.');
    if (version !== 'v1' || !expiry || !signature || Number(expiry) < Math.floor(Date.now() / 1000)) return false;
    const expectedSignature = await sign(`${version}.${expiry}`);
    return Boolean(expectedSignature && constantTimeEqual(decodeBase64Url(signature), decodeBase64Url(expectedSignature)));
  } catch {
    return false;
  }
}
