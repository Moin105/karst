import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loginInternal } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/ratelimit';

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  // Throttle credential guessing: 10 attempts / 15 min per IP. (scrypt is ~100ms
  // per try, but a script can still grind without this.)
  const rl = rateLimit(`login:${clientIp(request)}`, 10, 15 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

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
