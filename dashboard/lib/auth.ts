import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getIronSession, type SessionOptions } from 'iron-session';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export type SessionData = {
  userId: string;
  email: string;
  createdAt: number;
};

const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: SCRYPT_N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return `scrypt$N=${SCRYPT_N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, encoded: string): boolean {
  if (!encoded) return false;
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const nMatch = parts[1].match(/^N=(\d+)$/);
  if (!nMatch) return false;
  const N = parseInt(nMatch[1], 10);
  if (!Number.isFinite(N) || N <= 0) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[2], 'hex');
    expected = Buffer.from(parts[3], 'hex');
  } catch {
    return false;
  }
  let actual: Buffer;
  try {
    actual = scryptSync(plain, salt, expected.length, {
      N,
      r: 8,
      p: 1,
      maxmem: 128 * 1024 * 1024,
    });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  try {
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function authenticatePassword(email: string, password: string): boolean {
  const adminEmail = process.env.KARST_ADMIN_EMAIL;
  const adminHash = process.env.KARST_ADMIN_PASSWORD_HASH;
  if (!adminEmail || !adminHash) return false;
  if (!email || !password) return false;
  const emailOk = email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
  const passOk = verifyPassword(password, adminHash);
  return emailOk && passOk;
}

export function getSessionOptions(): SessionOptions {
  const password = process.env.KARST_SESSION_SECRET;
  if (!password) {
    throw new Error('KARST_SESSION_SECRET is not set');
  }
  return {
    cookieName: 'karst_session',
    password,
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession(): Promise<{ userId: string; email: string } | null> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());
  if (!session || !session.userId || !session.email) return null;
  return { userId: session.userId, email: session.email };
}

export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

// Internal — used by lib/actions.ts (the 'use server' module).
// Do NOT import these directly from client components; use lib/actions.ts.
export async function loginInternal(
  email: string,
  password: string
): Promise<'ok' | 'invalid'> {
  if (!authenticatePassword(email, password)) return 'invalid';
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    getSessionOptions()
  );
  session.userId = 'admin';
  session.email = email.trim().toLowerCase();
  session.createdAt = Date.now();
  await session.save();
  return 'ok';
}

export async function logoutInternal(): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    getSessionOptions()
  );
  session.destroy();
}
