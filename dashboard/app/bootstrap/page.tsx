import { notFound, redirect } from 'next/navigation';
import { timingSafeEqual } from 'node:crypto';
import { hashPassword } from '@/lib/auth';
import { setAdminPasswordHash } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Logo from '@/components/Logo';

// One-time admin password recovery, for when you are locked out and cannot read
// DATABASE_URL (Vercel marks it Sensitive, so it is write-only).
//
// This runs INSIDE the deployed app, so it uses the database connection the app
// already has. No local Neon string needed.
//
// DISABLED unless KARST_BOOTSTRAP_TOKEN is set — the page 404s otherwise.
// Set it, redeploy, use it once, then DELETE the env var and redeploy again.
// Leaving it enabled is a standing password-reset backdoor.

export const dynamic = 'force-dynamic';

function tokenMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function BootstrapPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; done?: string }>;
}) {
  const expected = process.env.KARST_BOOTSTRAP_TOKEN;
  if (!expected) notFound();

  const sp = await searchParams;
  const adminEmail = process.env.KARST_ADMIN_EMAIL || '';

  async function submit(formData: FormData) {
    'use server';
    const tok = process.env.KARST_BOOTSTRAP_TOKEN;
    if (!tok) notFound();

    // Shared bucket: this endpoint sets a password, so brute-forcing the token
    // must be expensive even though the token is long.
    const gate = rateLimit('bootstrap', 5, 60_000);
    if (!gate.ok) redirect('/bootstrap?e=rate');

    const email = (process.env.KARST_ADMIN_EMAIL || '').trim().toLowerCase();
    if (!email) redirect('/bootstrap?e=noemail');

    const supplied = String(formData.get('token') || '');
    const password = String(formData.get('password') || '');
    if (password.length < 8 || password.length > 200) redirect('/bootstrap?e=weak');
    if (!tokenMatches(supplied, tok)) redirect('/bootstrap?e=bad');

    // Writes admin_users.password_hash — the value authenticatePassword prefers
    // over KARST_ADMIN_PASSWORD_HASH — and bumps session_epoch, killing old sessions.
    await setAdminPasswordHash(email, hashPassword(password));
    redirect('/bootstrap?done=1');
  }

  const ERRORS: Record<string, string> = {
    bad: 'Wrong token.',
    weak: 'Password must be 8–200 characters.',
    rate: 'Too many attempts. Wait a minute and try again.',
    noemail: 'KARST_ADMIN_EMAIL is not set in this environment.',
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}
    >
      <Card>
        <div className="w-96 p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <Logo size={40} />
            <h1 className="mt-4 text-lg font-semibold" style={{ color: 'var(--text)' }}>
              Recover admin access
            </h1>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
              {adminEmail ? `Sets the password for ${adminEmail}` : 'One-time recovery'}
            </p>
          </div>

          {sp.done ? (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--accent-2)' }}>
                Password updated. You can sign in now.
              </p>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                Now delete <code>KARST_BOOTSTRAP_TOKEN</code> in Vercel and redeploy — while it
                is set, anyone with the token can reset this password.
              </p>
              <a href="/login">
                <Button variant="primary" size="md" className="w-full">
                  Go to sign in
                </Button>
              </a>
            </div>
          ) : (
            <form action={submit} className="space-y-4">
              {sp.e && (
                <p className="text-sm" style={{ color: '#f87171' }}>
                  {ERRORS[sp.e] || 'Something went wrong.'}
                </p>
              )}
              <div>
                <label className="text-[12px] text-text-dim">Bootstrap token</label>
                <Input name="token" type="password" required autoComplete="off" />
              </div>
              <div>
                <label className="text-[12px] text-text-dim">New admin password</label>
                <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
              </div>
              <Button variant="primary" size="md" type="submit" className="w-full">
                Set password
              </Button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
