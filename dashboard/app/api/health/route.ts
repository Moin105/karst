import { NextResponse } from 'next/server';
import { getClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let schemaReady = false;
  try {
    const db = await getClient();
    const r = await db.execute(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='signups'`
    );
    const n = Number((r.rows[0] as unknown as { n: number })?.n ?? 0);
    schemaReady = n > 0;
  } catch {
    schemaReady = false;
  }

  return NextResponse.json({
    ok: true,
    version: '0.1.0',
    db: 'libsql',
    schema_ready: schemaReady,
  });
}
