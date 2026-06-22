import { requireAdmin } from '@/lib/auth';
import { listSignups, searchSignups } from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/DataTable';
import { formatRelative } from '@/lib/format';
import type { Signup } from '@/lib/db';

export const dynamic = 'force-dynamic';

function sourceVariant(source?: string | null): 'default' | 'success' | 'warning' | 'danger' {
  if (!source) return 'default';
  const s = source.toLowerCase();
  if (s.includes('hn') || s.includes('hacker')) return 'warning';
  if (s.includes('twitter') || s.includes('x.com')) return 'default';
  if (s.includes('referral') || s.includes('friend')) return 'success';
  if (s.includes('blog')) return 'default';
  return 'default';
}

export default async function SignupsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  await requireAdmin();

  const params = (await searchParams) ?? {};
  const q = (params.q ?? '').trim();
  const rows: Signup[] = q ? await searchSignups(q) : await listSignups();

  const columns = [
    {
      key: 'email',
      header: 'Email',
      render: (r: Signup) => (
        <span className="font-mono text-[13px] text-text-base">{r.email}</span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      width: '160px',
      render: (r: Signup) => (
        <Badge variant={sourceVariant(r.source)}>{r.source ?? 'direct'}</Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      width: '160px',
      align: 'right' as const,
      render: (r: Signup) => (
        <span className="text-[13px] text-text-dim tabular-nums">
          {formatRelative(r.created_at)}
        </span>
      ),
    },
  ];

  return (
    <>
      <Topbar
        title="Signups"
        actions={
          <a href="/signups/export.csv" className="no-underline">
            <Button variant="secondary" size="sm">
              Export CSV
            </Button>
          </a>
        }
      />
      <main className="p-6 space-y-4">
        <Card className="p-0">
          <div className="flex items-center justify-between gap-4 border-b border-border p-4">
            <form method="GET" action="/signups" className="flex-1 max-w-[360px]">
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search by email, source, notes..."
                className="w-full"
              />
            </form>
            <span className="text-[11px] uppercase tracking-wide text-text-dim">
              Total{' '}
              <span className="text-text-base tabular-nums">{rows.length}</span>
            </span>
          </div>
          <DataTable
            rows={rows}
            columns={columns}
            emptyMessage={q ? `No signups match "${q}"` : 'No signups yet'}
          />
        </Card>
      </main>
    </>
  );
}
