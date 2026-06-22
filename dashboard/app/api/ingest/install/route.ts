import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insertInstall } from '@/lib/db';
import { handleOptions, withCors } from '@/lib/cors';
import { rateLimit, clientIp } from '@/lib/ratelimit';

const BodySchema = z.object({
  anonymous_id: z.string().min(1).max(64),
  version: z.string().min(1).max(32),
  os: z.string().min(1).max(64),
  python_version: z.string().max(32).optional(),
  country: z.string().max(64).optional(),
});

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  const rl = rateLimit(`install:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) {
    return withCors(
      NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }),
      origin
    );
  }

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
      NextResponse.json({ error: 'invalid' }, { status: 400 }),
      origin
    );
  }

  try {
    await insertInstall({
      anonymous_id: parsed.data.anonymous_id,
      version: parsed.data.version,
      os: parsed.data.os,
      python_version: parsed.data.python_version,
      country: parsed.data.country,
    });
    return withCors(NextResponse.json({ ok: true }), origin);
  } catch {
    return withCors(
      NextResponse.json({ error: 'server_error' }, { status: 500 }),
      origin
    );
  }
}
