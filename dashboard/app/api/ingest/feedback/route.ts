import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insertFeedback } from '@/lib/db';
import { handleOptions, withCors } from '@/lib/cors';

const BodySchema = z.object({
  source: z.enum(['cli', 'mcp', 'email', 'landing', 'other']),
  message: z.string().min(1),
  contact: z.string().optional(),
  severity: z.enum(['bug', 'idea', 'question', 'praise']).optional(),
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
    insertFeedback({
      source: parsed.data.source,
      message: parsed.data.message,
      contact: parsed.data.contact,
      severity: parsed.data.severity,
    });
    return withCors(NextResponse.json({ ok: true }), origin);
  } catch {
    return withCors(
      NextResponse.json({ error: 'server_error' }, { status: 500 }),
      origin
    );
  }
}
