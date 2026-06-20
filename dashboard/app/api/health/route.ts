import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  let schemaReady = false;
  try {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='signups'`
      )
      .get() as { n: number };
    schemaReady = row.n > 0;
  } catch {
    schemaReady = false;
  }

  return NextResponse.json({
    ok: true,
    version: '0.1.0',
    db: 'sqlite',
    schema_ready: schemaReady,
  });
}
