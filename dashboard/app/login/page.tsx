'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { loginAction } from '@/lib/actions';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Logo from '@/components/Logo';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" size="md" type="submit" disabled={pending} className="w-full">
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}

async function loginFormAction(
  _prev: 'ok' | 'invalid' | null,
  formData: FormData
): Promise<'ok' | 'invalid' | null> {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  return loginAction(email, password);
}

export default function LoginPage() {
  const [state, formAction] = useActionState(loginFormAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state === 'ok') router.replace('/');
  }, [state, router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}
    >
      <Card>
        <div className="w-96 p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <Logo size={40} />
            <h1
              className="mt-4 text-lg font-semibold"
              style={{ color: 'var(--text)' }}
            >
              Sign in to karst
            </h1>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
              code context for AI dev tools
            </p>
          </div>

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

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-xs font-medium"
                style={{ color: 'var(--text-dim)' }}
              >
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full"
              />
            </div>

            {state === 'invalid' && (
              <div
                className="text-xs rounded px-3 py-2 border"
                style={{
                  color: '#fca5a5',
                  background: 'rgba(239,68,68,0.08)',
                  borderColor: 'rgba(239,68,68,0.25)',
                }}
                role="alert"
              >
                Invalid email or password.
              </div>
            )}

            <SubmitButton />
          </form>
        </div>
      </Card>
    </div>
  );
}
