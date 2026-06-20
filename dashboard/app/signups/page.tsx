import { revalidatePath } from 'next/cache';
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

async function promoteAction(formData: FormData) {
  'use server';
  const id = Number(formData.get('id'));
  const { promoteSignupToPartner } = await import('@/lib/db');
  promoteSignupToPartner(id, {});
  revalidatePath('/signups');
  revalidatePath('/partners');
}

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
  const rows: Signup[] = q ? searchSignups(q) : listSignups();

  const columns = [
    {
      key: 'email',
      header: 'Email',
      render: (r: Signup) => (
        <span style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
          {r.email}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (r: Signup) => (
        <Badge variant={sourceVariant(r.source)}>{r.source ?? 'direct'}</Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (r: Signup) => (
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          {formatRelative(r.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r: Signup) => (
        <form action={promoteAction}>
          <input type="hidden" name="id" value={(r as any).id} />
          <Button variant="secondary" size="sm">
            Promote to partner
          </Button>
        </form>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Topbar
        title="Signups"
        actions={
          <a href="/signups/export.csv" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="sm">
              Export CSV
            </Button>
          </a>
        }
      />
      <main style={{ padding: 24, flex: 1 }}>
        <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: 16,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <form method="GET" action="/signups" style={{ flex: 1, maxWidth: 360 }}>
                <Input
                  name="q"
                  defaultValue={q}
                  placeholder="Search by email, source, notes..."
                  className="w-full"
                />
              </form>
              <Badge variant="default">Total: {rows.length}</Badge>
            </div>
          <div style={{ padding: 0 }}>
            <DataTable
              rows={rows}
              columns={columns}
              emptyMessage={q ? `No signups match "${q}"` : 'No signups yet'}
            />
          </div>
        </Card>
      </main>
    </div>
  );
}
