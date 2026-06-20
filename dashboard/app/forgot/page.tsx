'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { requestPasswordReset } from '@/lib/actions';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Logo from '@/components/Logo';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" size="md" type="submit" disabled={pending} className="w-full">
      {pending ? 'Sending…' : 'Send reset link'}
    </Button>
  );
}

async function forgotFormAction(
  _prev: 'sent' | null,
  formData: FormData
): Promise<'sent' | null> {
  const email = String(formData.get('email') || '');
  return requestPasswordReset(email);
}

export default function ForgotPage() {
  const [state, formAction] = useActionState(forgotFormAction, null);

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
              Reset your password
            </h1>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
              We&apos;ll email you a link to set a new one
            </p>
          </div>

          {state === 'sent' ? (
            <div className="space-y-4">
              <div
                className="text-sm rounded px-3 py-3 border"
                style={{
                  color: 'var(--accent-2, #34d399)',
                  background: 'rgba(16,185,129,0.08)',
                  borderColor: 'rgba(16,185,129,0.25)',
                }}
                role="status"
              >
                If an account exists for that email, a reset link is on its way.
                Check your inbox (and spam).
              </div>
              <Link
                href="/login"
                className="block text-center text-xs"
                style={{ color: 'var(--text-dim)' }}
              >
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="email"
                  className="block text-xs font-medium"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Email
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="w-full"
                />
              </div>

              <SubmitButton />

              <Link
                href="/login"
                className="block text-center text-xs"
                style={{ color: 'var(--text-dim)' }}
              >
                ← Back to sign in
              </Link>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
