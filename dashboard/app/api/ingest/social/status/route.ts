import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSocialPost, updateSocialPost } from '@/lib/db';
import { handleOptions, withCors } from '@/lib/cors';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { socialIngestToken, socialIngestAuthorized } from '@/lib/ingestAuth';

// The publish workflow in n8n calls back here after attempting to post, so the
// dashboard can flip a post to `posted` (with its live URL) or `failed` (with
// the error). Same shared-secret gate as the draft-ingest endpoint.
const BodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(['posted', 'failed']),
  external_url: z.string().url().max(1_000).optional(),
  error: z.string().max(2_000).optional(),
});

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  if (!socialIngestToken()) {
    return withCors(NextResponse.json({ error: 'ingest_disabled' }, { status: 503 }), origin);
  }
  if (!socialIngestAuthorized(request)) {
    return withCors(NextResponse.json({ error: 'unauthorized' }, { status: 401 }), origin);
  }

  const rl = rateLimit(`social-status:${clientIp(request)}`, 60, 60_000);
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
    return withCors(NextResponse.json({ error: 'invalid_json' }, { status: 400 }), origin);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return withCors(NextResponse.json({ error: 'invalid' }, { status: 400 }), origin);
  }

  const existing = await getSocialPost(parsed.data.id);
  if (!existing) {
    return withCors(NextResponse.json({ error: 'not_found' }, { status: 404 }), origin);
  }

  try {
    await updateSocialPost(parsed.data.id, {
      status: parsed.data.status,
      external_url: parsed.data.external_url ?? null,
      error: parsed.data.status === 'failed' ? parsed.data.error ?? 'unknown error' : null,
    });
    return withCors(NextResponse.json({ ok: true }), origin);
  } catch {
    return withCors(NextResponse.json({ error: 'server_error' }, { status: 500 }), origin);
  }
}
