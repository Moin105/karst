import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insertSignup } from '@/lib/db';
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

  try {
    await insertSignup({
      email: parsed.data.email.trim().toLowerCase(),
      source: parsed.data.source,
    });
    return withCors(NextResponse.json({ ok: true }), origin);
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return withCors(NextResponse.json({ ok: true, deduped: true }), origin);
    }
    return withCors(
      NextResponse.json({ error: 'server_error' }, { status: 500 }),
      origin
    );
  }
}
