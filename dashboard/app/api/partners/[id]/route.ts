import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { updatePartner } from '@/lib/db';

const BodySchema = z.object({
  name: z.string().optional(),
  email: z.string().email().nullable().optional(),
  company: z.string().nullable().optional(),
  vertical: z.string().nullable().optional(),
  status: z
    .enum(['lead', 'contacted', 'demo_booked', 'piloting', 'paying', 'lost'])
    .optional(),
  last_touch: z.number().int().nullable().optional(),
  notes_md: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id: idParam } = await context.params;
  const id = parseInt(idParam, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
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
    const updated = await updatePartner(id, parsed.data as any);
    if (!updated) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
