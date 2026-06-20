import { requireAdmin } from '@/lib/auth';
import {
  listFeedback,
  type Feedback,
  type FeedbackSeverity,
  type FeedbackStatus,
} from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/DataTable';
import { formatRelative, severityColor, statusColor } from '@/lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const FEEDBACK_STATUSES: FeedbackStatus[] = ['new', 'triaged', 'replied', 'closed'];
const FEEDBACK_SEVERITIES: FeedbackSeverity[] = ['bug', 'idea', 'question', 'praise'];

function coerceStatus(raw: string | undefined): FeedbackStatus | undefined {
  return raw && (FEEDBACK_STATUSES as readonly string[]).includes(raw)
    ? (raw as FeedbackStatus)
    : undefined;
}
function coerceSeverity(raw: string | undefined): FeedbackSeverity | undefined {
  return raw && (FEEDBACK_SEVERITIES as readonly string[]).includes(raw)
    ? (raw as FeedbackSeverity)
    : undefined;
}

function snippet(message: string, n = 120): string {
  const clean = (message ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= n) return clean;
  return clean.slice(0, n - 1) + '…';
}

export default async function FeedbackListPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; severity?: string }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const statusFilter = coerceStatus(sp.status);
  const severityFilter = coerceSeverity(sp.severity);

  const rows = listFeedback({
    status: statusFilter,
    severity: severityFilter,
  }) as Feedback[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Topbar title="Feedback" />

      <Card>
        <form
          method="get"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: 12,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="status"
              style={{ fontSize: 12, color: 'var(--text-dim)' }}
            >
              Status
            </label>
            <Select
              id="status"
              name="status"
              defaultValue={statusFilter ?? ''}
              className="min-w-[160px]"
            >
              <option value="">All</option>
              <option value="new">New</option>
              <option value="triaged">Triaged</option>
              <option value="replied">Replied</option>
              <option value="closed">Closed</option>
            </Select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="severity"
              style={{ fontSize: 12, color: 'var(--text-dim)' }}
            >
              Severity
            </label>
            <Select
              id="severity"
              name="severity"
              defaultValue={severityFilter ?? ''}
              className="min-w-[160px]"
            >
              <option value="">All</option>
              <option value="bug">Bug</option>
              <option value="idea">Idea</option>
              <option value="question">Question</option>
              <option value="praise">Praise</option>
            </Select>
          </div>

          <Button variant="primary" size="md">
            Apply
          </Button>

          {(statusFilter || severityFilter) && (
            <Link href="/feedback">
              <Button variant="ghost" size="md">
                Clear
              </Button>
            </Link>
          )}
        </form>
      </Card>

      <Card>
        <DataTable<Feedback>
          rows={rows}
          emptyMessage="No feedback yet matching these filters."
          columns={[
            {
              key: 'severity',
              header: 'Severity',
              render: (r) => (
                <Badge variant={severityColor(r.severity)}>
                  {r.severity ?? 'unset'}
                </Badge>
              ),
            },
            {
              key: 'source',
              header: 'Source',
              render: (r) => <Badge variant="default">{r.source}</Badge>,
            },
            {
              key: 'message',
              header: 'Snippet',
              render: (r) => (
                <Link
                  href={`/feedback/${r.id}`}
                  style={{ color: 'var(--text)', textDecoration: 'none' }}
                >
                  {snippet(r.message)}
                </Link>
              ),
            },
            {
              key: 'contact',
              header: 'Contact',
              render: (r) => (
                <span
                  style={{
                    color: 'var(--text-dim)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 13,
                  }}
                >
                  {r.contact || '—'}
                </span>
              ),
            },
            {
              key: 'created_at',
              header: 'Created',
              render: (r) => (
                <span style={{ color: 'var(--text-dim)' }}>
                  {formatRelative(r.created_at)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => (
                <Badge variant={statusColor(r.status)}>
                  {r.status ?? 'new'}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (r) => (
                <Link
                  href={`/feedback/${r.id}`}
                  style={{
                    color: 'var(--accent)',
                    fontSize: 13,
                    textDecoration: 'none',
                  }}
                >
                  Open →
                </Link>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
