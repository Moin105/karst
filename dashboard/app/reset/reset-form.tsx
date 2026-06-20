'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { resetPassword } from '@/lib/actions';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Logo from '@/components/Logo';

type State = 'ok' | 'invalid' | 'weak' | 'mismatch' | null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" size="md" type="submit" disabled={pending} className="w-full">
      {pending ? 'Saving…' : 'Set new password'}
    </Button>
  );
}

async function resetFormAction(_prev: State, formData: FormData): Promise<State> {
  const token = String(formData.get('token') || '');
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');
  if (password !== confirm) return 'mismatch';
  return resetPassword(token, password);
}

export default function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetFormAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state === 'ok') {
      const t = setTimeout(() => router.replace('/login'), 1600);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  const wrapperStyle = { background: 'var(--bg)' };
  const dimStyle = { color: 'var(--text-dim)' };

  const errorFor: Record<Exclude<State, 'ok' | null>, string> = {
    invalid: 'This reset link is invalid or has expired. Request a new one.',
    weak: 'Password must be at least 8 characters.',
    mismatch: 'The two passwords don’t match.',
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={wrapperStyle}>
      <Card>
        <div className="w-96 p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <Logo size={40} />
            <h1 className="mt-4 text-lg font-semibold" style={{ color: 'var(--text)' }}>
              Choose a new password
            </h1>
            <p className="mt-1 text-xs" style={dimStyle}>
              for your karst admin account
            </p>
          </div>

          {!token ? (
            <div className="space-y-4">
              <div
                className="text-sm rounded px-3 py-3 border"
                style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }}
                role="alert"
              >
                This reset link is missing its token. Request a new one.
              </div>
              <Link href="/forgot" className="block text-center text-xs" style={dimStyle}>
                Request a new reset link
              </Link>
            </div>
          ) : state === 'ok' ? (
            <div
              className="text-sm rounded px-3 py-3 border"
              style={{ color: 'var(--accent-2, #34d399)', background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' }}
              role="status"
            >
              Password updated. Redirecting you to sign in…
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />

              <div className="space-y-1">
                <label htmlFor="password" className="block text-xs font-medium" style={dimStyle}>
                  New password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="confirm" className="block text-xs font-medium" style={dimStyle}>
                  Confirm password
                </label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="w-full"
                />
              </div>

              {state && (
                <div
                  className="text-xs rounded px-3 py-2 border"
                  style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }}
                  role="alert"
                >
                  {errorFor[state]}
                </div>
              )}

              <SubmitButton />

              <Link href="/login" className="block text-center text-xs" style={dimStyle}>
                ← Back to sign in
              </Link>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
