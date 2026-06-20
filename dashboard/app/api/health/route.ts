import { NextResponse } from 'next/server';
import { getClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let schemaReady = false;
  try {
    const db = await getClient();
    // to_regclass returns NULL when the table doesn't exist (Postgres has no
    // sqlite_master catalog).
    const r = await db.execute(
      `SELECT (to_regclass('public.signups') IS NOT NULL) AS present`
    );
    schemaReady = Boolean((r.rows[0] as unknown as { present: boolean })?.present);
  } catch {
    schemaReady = false;
  }

  return NextResponse.json({
    ok: true,
    version: '0.1.0',
    db: 'postgres',
    schema_ready: schemaReady,
  });
}
