import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insertQuery } from '@/lib/db';
import { handleOptions, withCors } from '@/lib/cors';

const BodySchema = z.object({
  anonymous_id: z.string().min(1),
  repo_size_chunks: z.number().int().nonnegative(),
  tokens_used: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
  used_packs: z.boolean(),
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
    await insertQuery({
      anonymous_id: parsed.data.anonymous_id,
      repo_size_chunks: parsed.data.repo_size_chunks,
      tokens_used: parsed.data.tokens_used,
      cost_usd: parsed.data.cost_usd,
      used_packs: parsed.data.used_packs ? 1 : 0,
    });
    return withCors(NextResponse.json({ ok: true }), origin);
  } catch {
    return withCors(
      NextResponse.json({ error: 'server_error' }, { status: 500 }),
      origin
    );
  }
}
