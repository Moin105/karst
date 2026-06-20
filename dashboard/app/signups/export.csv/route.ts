import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { listSignups } from '@/lib/db';

export const dynamic = 'force-dynamic';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  await requireAdmin();

  const rows = await listSignups();

  const header = ['id', 'email', 'source', 'notes', 'created_at'];
  const lines = [header.join(',')];

  for (const r of rows as any[]) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.email),
        csvEscape(r.source),
        csvEscape(r.notes),
        csvEscape(r.created_at ?? r.createdAt),
      ].join(','),
    );
  }

  const body = lines.join('\n') + '\n';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="karst-signups.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
