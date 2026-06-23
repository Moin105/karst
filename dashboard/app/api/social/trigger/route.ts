import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { getSocialPost, listSocialAccounts } from '@/lib/db';

// Browser → (same-origin, admin cookie) → THIS route → n8n webhook.
//
// Doing the n8n call server-side (rather than fetching localhost:5678 from the
// browser) sidesteps mixed-content + CORS entirely: the page just calls its own
// origin. The n8n base URL stays server-only. When the dashboard runs on the
// same machine/LAN as n8n (the normal local setup) http://localhost:5678 works
// as-is; a hosted dashboard points KARST_N8N_BASE_URL at a tunnel/public n8n.
const N8N_BASE = (process.env.KARST_N8N_BASE_URL || 'http://localhost:5678').replace(/\/+$/, '');
const GEN_PATH = process.env.KARST_N8N_GENERATE_PATH || '/webhook/karst-social-generate';
const PUB_PATH = process.env.KARST_N8N_PUBLISH_PATH || '/webhook/karst-social-publish';

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('generate'),
    theme: z.string().max(500).optional(),
    platforms: z.array(z.enum(['x', 'reddit', 'discord', 'instagram'])).min(1),
  }),
  z.object({
    action: z.literal('publish'),
    id: z.number().int().positive(),
  }),
]);

async function postToN8n(url: string, payload: unknown): Promise<{ ok: boolean; status: number; detail?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, detail: res.ok ? undefined : await res.text().catch(() => '') };
  } catch (err) {
    return { ok: false, status: 0, detail: err instanceof Error ? err.message : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  if (parsed.data.action === 'generate') {
    const r = await postToN8n(`${N8N_BASE}${GEN_PATH}`, {
      theme: parsed.data.theme || '',
      platforms: parsed.data.platforms,
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: 'n8n_unreachable', status: r.status, detail: r.detail },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, action: 'generate' });
  }

  // publish: hand n8n a ready-to-post payload (content + non-secret routing
  // target). n8n posts to the platform and calls /api/ingest/social/status back.
  const post = await getSocialPost(parsed.data.id);
  if (!post) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (post.status !== 'approved') {
    return NextResponse.json({ error: 'not_approved' }, { status: 400 });
  }
  const accounts = await listSocialAccounts();
  const account = accounts.find((a) => a.platform === post.platform) || null;
  const r = await postToN8n(`${N8N_BASE}${PUB_PATH}`, {
    id: post.id,
    platform: post.platform,
    title: post.title,
    body: post.body,
    hashtags: post.hashtags,
    link: post.link,
    media_hint: post.media_hint,
    target: account?.target ?? null,
    handle: account?.handle ?? null,
  });
  if (!r.ok) {
    return NextResponse.json(
      { error: 'n8n_unreachable', status: r.status, detail: r.detail },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, action: 'publish' });
}
