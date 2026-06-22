import { requireAdmin } from '@/lib/auth';
import Link from 'next/link';
import {
  getKpis,
  listSignups,
  listFeedback,
  listInstalls,
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

  const badgeVariantFor = (kind: TimelineItem['kind']) => {
    if (kind === 'signup') return 'default' as const;
    if (kind === 'install') return 'success' as const;
    return 'warning' as const;
  };

  return (
    <div>
      <Topbar title="Overview" />

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  Recent activity
                </h2>
                <span className="text-xs tabular-nums text-[var(--text-dim)]">
                  top {timeline.length}
                </span>
              </div>
              {timeline.length === 0 ? (
                <p className="text-sm text-[var(--text-dim)]">
                  No activity yet.
                </p>
              ) : (
                <ul className="-my-2 divide-y divide-[var(--border)]">
                  {timeline.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 py-2 text-sm"
                    >
                      <Badge variant={badgeVariantFor(item.kind)}>
                        {item.kind}
                      </Badge>
                      <span className="flex-1 min-w-0 truncate text-[var(--text)]">
                        {item.summary}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-[var(--text-dim)]">
                        {formatRelative(item.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)] mb-3">
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
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)] mb-3">
                Enterprise
              </h2>
              <p className="text-sm text-[var(--text-dim)] leading-relaxed">
                The team gateway: one authenticated MCP endpoint with API keys,
                usage metering, and shared pack libraries.
              </p>
              <Link
                href="/enterprise"
                className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
              >
                Manage teams &amp; keys &rarr;
              </Link>
            </div>
          </Card>
        </div>

        <div className="text-xs text-[var(--text-dim)] pt-2">
          avg cost/query ={' '}
          <span className="font-mono tabular-nums text-[var(--text)]">
            {formatCurrency(kpis.avg_cost_query)}
          </span>
        </div>
      </div>
    </div>
  );
}
