import { requireAdmin } from '@/lib/auth';
import {
  queriesPerDay,
  avgCostPerQuery,
  costPerDay,
  computeTokensSavedEstimate,
} from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import KpiCard from '@/components/KpiCard';
import EmptyState from '@/components/EmptyState';
import QueriesChart from '@/components/charts/QueriesChart';
import CostChart from '@/components/charts/CostChart';

export const dynamic = 'force-dynamic';

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatUsd(v: number) {
  if (!Number.isFinite(v) || v === 0) return '$0.0000';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(3)}`;
}

export default async function AnalyticsPage() {
  await requireAdmin();

  const queries = await queriesPerDay(30);
  const avgCost = await avgCostPerQuery();
  const tokensSaved = await computeTokensSavedEstimate();
  const costSeries = await costPerDay(30);

  const totalQueries30d = queries.reduce((acc, p) => acc + p.count, 0);
  const hasData = totalQueries30d > 0;

  return (
    <>
      <Topbar title="Analytics" />
      <div className="p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="Avg cost / query"
            value={formatUsd(avgCost ?? 0)}
            hint="Sonnet 4.6 baseline"
            accent
          />
          <KpiCard
            label="Queries (last 30d)"
            value={formatNumber(totalQueries30d)}
            hint={`${queries.length} active days`}
          />
          <KpiCard
            label="Tokens saved with packs"
            value={formatNumber(tokensSaved)}
            hint="vs. ungrouped retrieval (est.)"
          />
        </div>

        <Card>
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
              Queries per day
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[26px] font-bold leading-none tabular-nums text-[var(--text)]">
                {totalQueries30d.toLocaleString()}
              </span>
              <span className="text-[13px] text-[var(--text-dim)]">
                last 30d
              </span>
            </div>
          </div>
          <div className="p-4">
            {hasData ? (
              <QueriesChart data={queries} />
            ) : (
              <EmptyState
                title="No query data yet"
                description="Run karst against a repo and queries will populate this chart."
              />
            )}
          </div>
        </Card>

        <Card>
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
              Average cost per query
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[26px] font-bold leading-none tabular-nums text-[var(--text)]">
                {formatUsd(avgCost ?? 0)}
              </span>
              <span className="text-[13px] text-[var(--text-dim)]">
                all-time avg
              </span>
            </div>
          </div>
          <div className="p-4">
            {costSeries.length > 0 ? (
              <CostChart data={costSeries} />
            ) : (
              <EmptyState
                title="No cost data yet"
                description="Per-query cost will be charted here once queries are logged."
              />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
