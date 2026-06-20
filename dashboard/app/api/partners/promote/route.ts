import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { promoteSignupToPartner } from '@/lib/db';

const BodySchema = z.object({
  signup_id: z.number().int().positive(),
  name: z.string().optional(),
  company: z.string().optional(),
  vertical: z.string().optional(),
  notes_md: z.string().optional(),
});

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
    return NextResponse.json(
      { error: 'invalid', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const partner = promoteSignupToPartner(parsed.data.signup_id, {
      name: parsed.data.name,
      company: parsed.data.company,
      vertical: parsed.data.vertical,
      notes_md: parsed.data.notes_md,
    });
    return NextResponse.json({ ok: true, partner_id: partner.id });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg.includes('not found')) {
      return NextResponse.json({ error: 'signup_not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
