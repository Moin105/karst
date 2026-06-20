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
    installsPerDay(30),
    listInstalls(50),
  ]);

  const totalInRange = series.reduce((acc, p) => acc + p.count, 0);

  const columns = [
    {
      key: 'anonymous_id',
      header: 'Anon ID',
      width: '140px',
      render: (r: Install) => (
        <span
          className="block truncate font-mono text-[12px] text-text-dim"
          title={(r as any).anonymous_id ?? undefined}
        >
          {truncate((r as any).anonymous_id, 10)}
        </span>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      width: '100px',
      render: (r: Install) => (
        <span className="font-mono text-[12px] text-text-base tabular-nums">
          {(r as any).version ?? '—'}
        </span>
      ),
    },
    {
      key: 'os',
      header: 'OS',
      width: '120px',
      render: (r: Install) => (
        <span className="text-[13px] text-text-base">{(r as any).os ?? '—'}</span>
      ),
    },
    {
      key: 'python_version',
      header: 'Python',
      width: '100px',
      render: (r: Install) => (
        <span className="font-mono text-[12px] text-text-dim tabular-nums">
          {(r as any).python_version ?? '—'}
        </span>
      ),
    },
    {
      key: 'country',
      header: 'Country',
      width: '100px',
      render: (r: Install) => (
        <span className="text-[13px] text-text-dim">{(r as any).country ?? '—'}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Installed',
      width: '140px',
      align: 'right' as const,
      render: (r: Install) => (
        <span className="text-[12px] text-text-dim tabular-nums">
          {formatRelative(r.created_at)}
        </span>
      ),
    },
  ];

  return (
    <>
      <Topbar title="Installs" />
      <main className="p-6 space-y-4">
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="text-[11px] uppercase tracking-wide text-text-dim">
              Installs per day
            </div>
            <div className="text-[13px] text-text-dim">
              <span className="text-2xl font-bold text-text-base tabular-nums">
                {totalInRange.toLocaleString()}
              </span>
              <span className="ml-2">last 30d</span>
            </div>
          </div>
          <div className="p-4">
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

        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="text-[11px] uppercase tracking-wide text-text-dim">
              Recent installs
            </div>
            <span className="text-[13px] text-text-dim tabular-nums">
              Last {recent.length}
            </span>
          </div>
          <DataTable
            rows={recent}
            columns={columns}
            emptyMessage="No installs recorded yet."
          />
        </Card>
      </main>
    </>
  );
}
