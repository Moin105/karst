import { requireAdmin } from '@/lib/auth';
import { installsPerDay, listInstalls, type Install } from '@/lib/db';
import { getPypiStats, type Breakdown } from '@/lib/pypistats';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import InstallsChart from '@/components/charts/InstallsChart';
import { formatRelative, formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';

function truncate(s: string | null | undefined, n = 10) {
  if (!s) return '—';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-wide text-text-dim">{label}</div>
      <div className="mt-2 text-3xl font-bold tabular-nums text-text-base">{value}</div>
      {sub ? <div className="mt-1 text-[12px] text-text-dim">{sub}</div> : null}
    </Card>
  );
}

function BreakdownBars({ title, rows }: { title: string; rows: Breakdown[] }) {
  const top = rows.slice(0, 6);
  const max = Math.max(1, ...top.map((r) => r.downloads));
  return (
    <Card className="p-0">
      <div className="border-b border-border p-4 text-[11px] uppercase tracking-wide text-text-dim">
        {title}
      </div>
      <div className="space-y-3 p-4">
        {top.length === 0 ? (
          <div className="text-[13px] text-text-dim">No data yet.</div>
        ) : (
          top.map((r) => (
            <div key={r.label}>
              <div className="mb-1 flex items-center justify-between text-[13px]">
                <span className="text-text-base">{r.label}</span>
                <span className="tabular-nums text-text-dim">{formatNumber(r.downloads)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{ width: `${Math.max(3, (r.downloads / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export default async function InstallsPage() {
  await requireAdmin();

  const [pypi, series, recent] = await Promise.all([
    getPypiStats(),
    installsPerDay(30),
    listInstalls(50),
  ]);

  const pypiChart = pypi.perDay.slice(-30);
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
      <Topbar title="Installs & downloads" />
      <main className="space-y-8 p-6">
        {/* ---- PyPI downloads (public, aggregate) ---- */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text-base">PyPI downloads</h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-text-dim">
              Real download counts for <span className="font-mono">{pypi.package}</span> from
              pypistats.org. These are <strong>anonymous and aggregate</strong> — PyPI never
              reveals who installed a package (no names, emails, or IPs). Numbers lag ~1 day.
            </p>
          </div>

          {!pypi.available ? (
            <Card>
              <EmptyState
                title="No PyPI data yet"
                description="pypistats.org hasn't reported downloads for this package yet — it ingests daily and skips packages with very few downloads. Check back in a day or two after a release."
              />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat label="Last 24 hours" value={formatNumber(pypi.lastDay)} sub="downloads" />
                <Stat label="Last 7 days" value={formatNumber(pypi.lastWeek)} sub="downloads" />
                <Stat label="Last 30 days" value={formatNumber(pypi.lastMonth)} sub="downloads" />
              </div>

              <Card className="p-0">
                <div className="border-b border-border p-4 text-[11px] uppercase tracking-wide text-text-dim">
                  Downloads per day (last 30)
                </div>
                <div className="p-4">
                  {pypiChart.length === 0 ? (
                    <EmptyState title="No daily series yet" description="Daily breakdown will appear once pypistats has a few days of data." />
                  ) : (
                    <InstallsChart data={pypiChart} />
                  )}
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <BreakdownBars title="By Python version" rows={pypi.byPython} />
                <BreakdownBars title="By operating system" rows={pypi.bySystem} />
              </div>
            </>
          )}
        </section>

        {/* ---- First-party telemetry (opt-in) ---- */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text-base">First-party telemetry</h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-text-dim">
              Optional, anonymous pings the karst CLI can send on install/use (a random id,
              version, OS — never anything identifying). This stays empty unless telemetry is
              enabled in the package.
            </p>
          </div>

          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="text-[11px] uppercase tracking-wide text-text-dim">
                Pings per day
              </div>
              <div className="text-[13px] text-text-dim">
                <span className="text-2xl font-bold tabular-nums text-text-base">
                  {totalInRange.toLocaleString()}
                </span>
                <span className="ml-2">last 30d</span>
              </div>
            </div>
            <div className="p-4">
              {series.length === 0 ? (
                <EmptyState
                  title="No first-party telemetry yet"
                  description="Once the karst CLI opts in and phones home, anonymous install activity shows up here."
                />
              ) : (
                <InstallsChart data={series} />
              )}
            </div>
          </Card>

          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="text-[11px] uppercase tracking-wide text-text-dim">
                Recent pings
              </div>
              <span className="text-[13px] text-text-dim tabular-nums">
                Last {recent.length}
              </span>
            </div>
            <DataTable
              rows={recent}
              columns={columns}
              emptyMessage="No first-party telemetry recorded yet."
            />
          </Card>
        </section>
      </main>
    </>
  );
}
