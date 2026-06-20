import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { z } from 'zod';
import { authenticatePassword, getSessionOptions, type SessionData } from '@/lib/auth';

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

  if (!authenticatePassword(email, password)) {
    return NextResponse.json({ error: 'invalid' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());
  session.userId = 'admin';
  session.email = email.trim().toLowerCase();
  session.createdAt = Date.now();
  await session.save();

  return NextResponse.json({ ok: true });
}
