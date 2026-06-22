import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insertQuery } from '@/lib/db';
import { handleOptions, withCors } from '@/lib/cors';
import { rateLimit, clientIp } from '@/lib/ratelimit';

const BodySchema = z.object({
  anonymous_id: z.string().min(1).max(64),
  repo_size_chunks: z.number().int().nonnegative().max(100_000_000),
  tokens_used: z.number().int().nonnegative().max(1_000_000_000),
  cost_usd: z.number().nonnegative().max(1_000_000),
  used_packs: z.boolean(),
});

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  const rl = rateLimit(`query:${clientIp(request)}`, 60, 60_000);
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
