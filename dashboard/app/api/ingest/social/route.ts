import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insertSocialPost } from '@/lib/db';
import { handleOptions, withCors } from '@/lib/cors';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { socialIngestToken, socialIngestAuthorized } from '@/lib/ingestAuth';

// n8n POSTs generated drafts here. Unlike the public feedback form this is a
// machine-to-machine endpoint, so it's gated by a shared secret
// (KARST_SOCIAL_INGEST_TOKEN) sent as `Authorization: Bearer <token>`. With no
// token configured the endpoint is disabled (fail closed) — set the env var to
// turn the pipeline on.
const BodySchema = z.object({
  platform: z.enum(['x', 'reddit', 'discord', 'instagram']),
  body: z.string().min(1).max(10_000),
  theme: z.string().max(500).optional(),
  title: z.string().max(300).optional(),
  hashtags: z.string().max(500).optional(),
  link: z.string().url().max(500).optional(),
  media_hint: z.string().max(1_000).optional(),
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

  // n8n can batch several drafts; allow a healthy burst but still cap abuse.
  const rl = rateLimit(`social:${clientIp(request)}`, 60, 60_000);
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

  try {
    const post = await insertSocialPost({
      platform: parsed.data.platform,
      body: parsed.data.body,
      theme: parsed.data.theme,
      title: parsed.data.title,
      hashtags: parsed.data.hashtags,
      link: parsed.data.link,
      media_hint: parsed.data.media_hint,
    });
    return withCors(NextResponse.json({ ok: true, id: post.id }), origin);
  } catch {
    return withCors(NextResponse.json({ error: 'server_error' }, { status: 500 }), origin);
  }
}
