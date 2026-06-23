import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { getSocialPost, listSocialAccounts, updateSocialPost } from '@/lib/db';
import { generateDrafts } from '@/lib/social/generate';
import { publishPost } from '@/lib/social/publish';

// Two engines, picked at runtime:
//   • DEFAULT (in-process) — generation (Claude) + publishing (platform APIs) run
//     right here on Vercel. Zero extra infra; works on the live dashboard as-is.
//   • n8n (opt-in) — set KARST_N8N_BASE_URL to your n8n's PUBLIC url (e.g. a
//     Cloudflare Tunnel to your local n8n) and the buttons forward to n8n instead.
//     n8n then pushes drafts to /api/ingest/social and publish status to
//     /api/ingest/social/status (so KARST_SOCIAL_INGEST_TOKEN must be set too).
//     See integrations/n8n/README.md.
export const runtime = 'nodejs';
export const maxDuration = 60;

const N8N_BASE = (process.env.KARST_N8N_BASE_URL || '').replace(/\/+$/, '');
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

async function postToN8n(path: string, payload: unknown): Promise<{ ok: boolean; status: number; detail?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${N8N_BASE}${path}`, {
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
  const useN8n = N8N_BASE.length > 0;

  // ---- generate ----------------------------------------------------------
  if (parsed.data.action === 'generate') {
    if (useN8n) {
      const r = await postToN8n(GEN_PATH, { theme: parsed.data.theme || '', platforms: parsed.data.platforms });
      if (!r.ok) {
        return NextResponse.json({ error: 'n8n_unreachable', detail: r.detail }, { status: 502 });
      }
      return NextResponse.json({ ok: true, via: 'n8n' });
    }
    try {
      const { created, errors } = await generateDrafts(parsed.data.theme || '', parsed.data.platforms);
      if (created.length === 0) {
        return NextResponse.json(
          { error: 'generation_failed', detail: errors[0]?.error || 'no drafts produced' },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, created: created.length, errors });
    } catch (e) {
      return NextResponse.json(
        { error: 'generation_failed', detail: e instanceof Error ? e.message : 'error' },
        { status: 502 }
      );
    }
  }

  // ---- publish -----------------------------------------------------------
  const post = await getSocialPost(parsed.data.id);
  if (!post) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (post.status !== 'approved') {
    return NextResponse.json({ error: 'not_approved' }, { status: 400 });
  }
  const accounts = await listSocialAccounts();
  const account = accounts.find((a) => a.platform === post.platform) || null;

  if (useN8n) {
    // Hand n8n a ready-to-post payload; it posts + calls /api/ingest/social/status.
    const r = await postToN8n(PUB_PATH, {
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
      return NextResponse.json({ error: 'n8n_unreachable', detail: r.detail }, { status: 502 });
    }
    return NextResponse.json({ ok: true, via: 'n8n', status: 'publishing' });
  }

  const result = await publishPost(post, account);
  await updateSocialPost(post.id, {
    status: result.status,
    external_url: result.external_url,
    error: result.status === 'failed' ? result.error : null,
  });
  if (result.status === 'failed') {
    return NextResponse.json({ ok: false, status: 'failed', detail: result.error }, { status: 200 });
  }
  return NextResponse.json({ ok: true, status: 'posted', external_url: result.external_url });
}
