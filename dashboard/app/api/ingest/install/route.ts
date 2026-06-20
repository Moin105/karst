import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insertInstall } from '@/lib/db';
import { handleOptions, withCors } from '@/lib/cors';

const BodySchema = z.object({
  anonymous_id: z.string().min(1),
  version: z.string().min(1),
  os: z.string().min(1),
  python_version: z.string().optional(),
  country: z.string().optional(),
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
