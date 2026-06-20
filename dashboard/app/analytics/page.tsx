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

  const queries = queriesPerDay(30);
  const avgCost = avgCostPerQuery();
  const tokensSaved = computeTokensSavedEstimate();
  const costSeries = costPerDay(30);

  const totalQueries30d = queries.reduce((acc, p) => acc + p.count, 0);
  const hasData = totalQueries30d > 0;

  return (
    <>
      <Topbar title="Analytics" />
      <div
        style={{
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
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
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Queries per day
            </div>
            <div
              style={{
                fontSize: 20,
                color: 'var(--text)',
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              {totalQueries30d.toLocaleString()}
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
          <div style={{ padding: 16 }}>
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
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Average cost per query
            </div>
            <div
              style={{
                fontSize: 20,
                color: 'var(--text)',
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              {formatUsd(avgCost ?? 0)}
              <span
                style={{
                  color: 'var(--text-dim)',
                  fontWeight: 400,
                  fontSize: 13,
                  marginLeft: 6,
                }}
              >
                all-time avg
              </span>
            </div>
          </div>
          <div style={{ padding: 16 }}>
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
