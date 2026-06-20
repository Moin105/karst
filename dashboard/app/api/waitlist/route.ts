import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insertSignup } from '@/lib/db';
import { sendSignupWelcome, notifyOwnerOfSignup } from '@/lib/email';
import { handleOptions, withCors } from '@/lib/cors';

const BodySchema = z.object({
  email: z.string().email(),
  source: z.string().optional(),
});

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return withCors(
      NextResponse.json({ error: 'invalid_json' }, { status: 400 }),
      origin
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return withCors(
      NextResponse.json({ error: 'invalid', details: parsed.error.flatten() }, { status: 400 }),
      origin
    );
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    const signup = await insertSignup({ email, source: parsed.data.source });

    // Only email genuinely new signups (xmax = 0). Best-effort: a mail failure
    // is logged but never turns a successful signup into an error response.
    if (signup.is_new) {
      const results = await Promise.allSettled([
        sendSignupWelcome(email),
        notifyOwnerOfSignup(email, parsed.data.source ?? null),
      ]);
      for (const r of results) {
        if (r.status === 'rejected') {
          console.error('[waitlist] email send failed:', r.reason);
        }
      }
    }

    return withCors(
      NextResponse.json({ ok: true, deduped: !signup.is_new }),
      origin
    );
  } catch (err: any) {
    const msg = String(err?.message || '');
    // Defensive: ON CONFLICT means inserts upsert rather than throw, but if a
    // unique violation ever surfaces, treat it as a successful (deduped) signup.
    if (err?.code === '23505' || msg.toLowerCase().includes('unique')) {
      return withCors(NextResponse.json({ ok: true, deduped: true }), origin);
    }
    console.error('[waitlist] insert failed:', err);
    return withCors(
      NextResponse.json({ error: 'server_error' }, { status: 500 }),
      origin
    );
  }
}
