import { requireAdmin } from '@/lib/auth';
import {
  getKpis,
  listSignups,
  listFeedback,
  listInstalls,
  listPartners,
} from '@/lib/db';
import KpiCard from '@/components/KpiCard';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatRelative, formatCurrency } from '@/lib/format';
import checklist from '@/lib/checklist.json';

type TimelineItem = {
  kind: 'signup' | 'install' | 'feedback';
  summary: string;
  created_at: number;
};

export default async function OverviewPage() {
  await requireAdmin();

  const kpis = await getKpis();
  const recentSignups = (await listSignups()).slice(0, 5);
  const recentFeedback = (await listFeedback({ status: 'new' })).slice(0, 5);
  const recentInstalls = await listInstalls(5);
  const partners = await listPartners();

  const timeline: TimelineItem[] = [
    ...recentSignups.map((s: any) => ({
      kind: 'signup' as const,
      summary: s.email + (s.source ? ` via ${s.source}` : ''),
      created_at: s.created_at,
    })),
    ...recentInstalls.map((i: any) => ({
      kind: 'install' as const,
      summary: `v${i.version} on ${i.os}${i.country ? ` (${i.country})` : ''}`,
      created_at: i.created_at,
    })),
    ...recentFeedback.map((f: any) => ({
      kind: 'feedback' as const,
      summary:
        (f.message || '').slice(0, 80) +
        ((f.message || '').length > 80 ? '...' : ''),
      created_at: f.created_at,
    })),
  ]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 10);

  const pipelineCounts = partners.reduce<Record<string, number>>((acc, p: any) => {
    const status = p.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const pipelineTotal = Object.values(pipelineCounts).reduce(
    (a, b) => a + b,
    0
  );
  const pipelineEntries = Object.entries(pipelineCounts);

  const statusColor: Record<string, string> = {
    lead: 'bg-[var(--text-dim)]',
    contacted: 'bg-[var(--accent)]',
    demo_booked: 'bg-amber-400',
    piloting: 'bg-[var(--accent-2)]',
    paying: 'bg-[var(--accent-2)]',
    lost: 'bg-red-500',
  };

  const badgeVariantFor = (kind: TimelineItem['kind']) => {
    if (kind === 'signup') return 'default' as const;
    if (kind === 'install') return 'success' as const;
    return 'warning' as const;
  };

  return (
    <div>
      <Topbar title="Overview" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="New signups (24h)"
            value={kpis.new_signups_24h}
            hint="last 24 hours"
          />
          <KpiCard
            label="MCP installs (7d)"
            value={kpis.installs_7d}
            hint="last 7 days"
          />
          <KpiCard
            label="Queries (24h)"
            value={kpis.queries_24h}
            hint="last 24 hours"
          />
          <KpiCard
            label="Open feedback"
            value={kpis.open_feedback}
            accent={kpis.open_feedback > 0}
            hint="needs triage"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Recent activity
                </h2>
                <span className="text-xs text-[var(--text-dim)]">
                  top {timeline.length}
                </span>
              </div>
              {timeline.length === 0 ? (
                <p className="text-sm text-[var(--text-dim)]">
                  No activity yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {timeline.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-sm"
                    >
                      <Badge variant={badgeVariantFor(item.kind)}>
                        {item.kind}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-[var(--text)] truncate">
                          {item.summary}
                        </p>
                        <p className="text-xs text-[var(--text-dim)] mt-0.5">
                          {formatRelative(item.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-5">
              <h2 className="text-sm font-semibold text-[var(--text)] mb-4">
                This week&apos;s todos
              </h2>
              {(!checklist || (checklist as any[]).length === 0) ? (
                <p className="text-sm text-[var(--text-dim)]">
                  Nothing on the list.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(checklist as Array<{ text: string; status: string }>).map(
                    (item, i) => (
                      <li key={i}>
                        <label className="flex items-start gap-2 text-sm text-[var(--text)] cursor-pointer">
                          <input
                            type="checkbox"
                            defaultChecked={item.status === 'done'}
                            className="mt-0.5 accent-[var(--accent)]"
                          />
                          <span
                            className={
                              item.status === 'done'
                                ? 'line-through text-[var(--text-dim)]'
                                : ''
                            }
                          >
                            {item.text}
                          </span>
                        </label>
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Pipeline
                </h2>
                <span className="text-xs text-[var(--text-dim)]">
                  {pipelineTotal} partner{pipelineTotal === 1 ? '' : 's'}
                </span>
              </div>
              {pipelineTotal === 0 ? (
                <p className="text-sm text-[var(--text-dim)]">
                  No partners yet.
                </p>
              ) : (
                <>
                  <div className="flex w-full h-2 rounded overflow-hidden bg-[var(--border)]">
                    {pipelineEntries.map(([status, count]) => (
                      <div
                        key={status}
                        className={statusColor[status] || 'bg-[var(--text-dim)]'}
                        style={{
                          width: `${(count / pipelineTotal) * 100}%`,
                        }}
                        title={`${status}: ${count}`}
                      />
                    ))}
                  </div>
                  <ul className="mt-4 space-y-2">
                    {pipelineEntries.map(([status, count]) => (
                      <li
                        key={status}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="flex items-center gap-2 text-[var(--text)]">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${
                              statusColor[status] || 'bg-[var(--text-dim)]'
                            }`}
                          />
                          <span className="capitalize">{status}</span>
                        </span>
                        <span className="font-mono text-[var(--text-dim)]">
                          {count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="text-xs text-[var(--text-dim)] pt-2">
          avg cost/query ={' '}
          <span className="font-mono text-[var(--text)]">
            {formatCurrency(kpis.avg_cost_query)}
          </span>
        </div>
      </div>
    </div>
  );
}
