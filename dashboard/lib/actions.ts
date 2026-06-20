'use server';

import { randomBytes } from 'node:crypto';
import { headers } from 'next/headers';
import { loginInternal, logoutInternal, hashToken, hashPassword } from './auth';
import {
  createPasswordReset,
  consumePasswordReset,
  setAdminPasswordHash,
  recentPasswordResetExists,
} from './db';
import { sendPasswordReset } from './email';

export async function loginAction(
  email: string,
  password: string
): Promise<'ok' | 'invalid'> {
  return loginInternal(email, password);
}

export async function logoutAction(): Promise<void> {
  return logoutInternal();
}

/**
 * Resolve the app's public origin for building the emailed reset link.
 * Prefers a trusted, non-request-controlled source so the link can't be
 * poisoned by a spoofed Host header. Returns null in production when no trusted
 * origin is configured (we refuse to trust request headers there).
 */
async function appBaseUrl(): Promise<string | null> {
  const configured =
    process.env.KARST_PUBLIC_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') return null;
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3001';
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Start a password reset. Always resolves to 'sent' regardless of whether the
 * email matches — never reveal whether an account exists. Only the configured
 * admin email gets a link. Rate-limited and never logs the token in production.
 */
export async function requestPasswordReset(email: string): Promise<'sent'> {
  const adminEmail = process.env.KARST_ADMIN_EMAIL;
  const target = email.trim().toLowerCase();
  if (adminEmail && target === adminEmail.trim().toLowerCase()) {
    try {
      // Rate limit: at most one reset request per minute for this address.
      const recent = await recentPasswordResetExists(adminEmail, Date.now() - 60_000);
      if (!recent) {
        const base = await appBaseUrl();
        if (!base) {
          console.error('[reset] KARST_PUBLIC_URL is not set; cannot build a safe reset link');
        } else {
          const token = randomBytes(32).toString('hex');
          const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
          await createPasswordReset(adminEmail, hashToken(token), expiresAt);
          const link = `${base}/reset?token=${token}`;
          const sent = await sendPasswordReset(adminEmail, link);
          if (!sent) {
            // Never write the token to production logs.
            if (process.env.NODE_ENV !== 'production') {
              console.log('[reset] email disabled — reset link:', link);
            } else {
              console.error('[reset] reset email could not be sent (SMTP not configured)');
            }
          }
        }
      }
    } catch (err) {
      // Swallow so the response stays constant. The error never contains the token.
      console.error('[reset] request failed:', err);
    }
  }
  return 'sent';
}

/** Complete a password reset with a token + new password. */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<'ok' | 'invalid' | 'weak'> {
  // Min length + an upper bound so an attacker can't burn CPU via a huge
  // scrypt input through the public reset form.
  if (!newPassword || newPassword.length < 8 || newPassword.length > 200) return 'weak';
  if (!token) return 'invalid';
  const email = await consumePasswordReset(hashToken(token));
  if (!email) return 'invalid';
  await setAdminPasswordHash(email, hashPassword(newPassword));
  return 'ok';
}
