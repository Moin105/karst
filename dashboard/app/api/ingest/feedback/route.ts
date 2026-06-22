import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insertFeedback } from '@/lib/db';
import { notifyOwnerOfFeedback } from '@/lib/email';
import { handleOptions, withCors } from '@/lib/cors';
import { rateLimit, clientIp } from '@/lib/ratelimit';

const BodySchema = z.object({
  source: z.enum(['cli', 'mcp', 'email', 'landing', 'other']),
  message: z.string().min(1).max(10_000),
  contact: z.string().max(200).optional(),
  severity: z.enum(['bug', 'idea', 'question', 'praise']).optional(),
});

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  // This endpoint sends an owner email per submission — rate-limit hard to
  // block email-bombing / DB-flooding from an unauthenticated caller.
  const rl = rateLimit(`feedback:${clientIp(request)}`, 5, 60_000);
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
    await insertFeedback({
      source: parsed.data.source,
      message: parsed.data.message,
      contact: parsed.data.contact,
      severity: parsed.data.severity,
    });

    // Best-effort owner ping — a mail failure must never fail the submission.
    try {
      await notifyOwnerOfFeedback({
        message: parsed.data.message,
        contact: parsed.data.contact,
        severity: parsed.data.severity,
        source: parsed.data.source,
      });
    } catch (err) {
      console.error('[ingest/feedback] owner notify failed:', err);
    }

    return withCors(NextResponse.json({ ok: true }), origin);
  } catch {
    return withCors(
      NextResponse.json({ error: 'server_error' }, { status: 500 }),
      origin
    );
  }
}
