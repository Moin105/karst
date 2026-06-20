import { requireAdmin } from '@/lib/auth';
import { installsPerDay, listInstalls, type Install } from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import InstallsChart from '@/components/charts/InstallsChart';
import { formatRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';

function truncate(s: string | null | undefined, n = 10) {
  if (!s) return '—';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export default async function InstallsPage() {
  await requireAdmin();

  const [series, recent] = await Promise.all([
    Promise.resolve(installsPerDay(30)),
    Promise.resolve(listInstalls(50)),
  ]);

  const totalInRange = series.reduce((acc, p) => acc + p.count, 0);

  const columns = [
    {
      key: 'anonymous_id',
      header: 'Anon ID',
      render: (r: Install) => (
        <span
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono"), monospace',
            color: 'var(--text-dim)',
            fontSize: 12,
          }}
        >
          {truncate((r as any).anonymous_id, 10)}
        </span>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (r: Install) => (
        <span
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono"), monospace',
            fontSize: 12,
          }}
        >
          {(r as any).version ?? '—'}
        </span>
      ),
    },
    {
      key: 'os',
      header: 'OS',
      render: (r: Install) => <span>{(r as any).os ?? '—'}</span>,
    },
    {
      key: 'python_version',
      header: 'Python',
      render: (r: Install) => (
        <span
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono"), monospace',
            color: 'var(--text-dim)',
            fontSize: 12,
          }}
        >
          {(r as any).python_version ?? '—'}
        </span>
      ),
    },
    {
      key: 'country',
      header: 'Country',
      render: (r: Install) => (
        <span style={{ color: 'var(--text-dim)' }}>{(r as any).country ?? '—'}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Installed',
      render: (r: Install) => (
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
          {formatRelative(r.created_at)}
        </span>
      ),
    },
  ];

  return (
    <>
      <Topbar title="Installs" />
      <div
        style={{
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <Card>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Installs per day
              </div>
              <div
                style={{
                  fontSize: 20,
                  color: 'var(--text)',
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {totalInRange.toLocaleString()}
                <span
                  style={{
                    color: 'var(--text-dim)',
                    fontWeight: 400,
                    fontSize: 13,
                    marginLeft: 6,
                  }}
                >
                  last 30d
                </span>
              </div>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {series.length === 0 ? (
              <EmptyState
                title="No installs yet"
                description="Once the karst CLI phones home, install activity will show up here."
              />
            ) : (
              <InstallsChart data={series} />
            )}
          </div>
        </Card>

        <Card>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-dim)',
              }}
            >
              Recent installs
            </div>
            <div
              style={{
                fontSize: 16,
                color: 'var(--text)',
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              Last {recent.length}
            </div>
          </div>
          <div style={{ padding: 0 }}>
            <DataTable
              rows={recent}
              columns={columns}
              emptyMessage="No installs recorded yet."
            />
          </div>
        </Card>
      </div>
    </>
  );
}
