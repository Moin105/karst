import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loginInternal } from '@/lib/auth';

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // Route through loginInternal so credential verification (awaited!) and the
  // session-minting/epoch logic live in exactly one place.
  const result = await loginInternal(email, password);
  if (result !== 'ok') {
    return NextResponse.json({ error: 'invalid' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
