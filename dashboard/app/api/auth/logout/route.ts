import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { getSessionOptions, type SessionData } from '@/lib/auth';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());
  session.destroy();

  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/html')) {
    const url = new URL('/login', request.url);
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.json({ ok: true });
}
