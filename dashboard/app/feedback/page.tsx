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

function snippet(message: string): string {
  return (message ?? '').replace(/\s+/g, ' ').trim();
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

  const rows = await listFeedback({
    status: statusFilter,
    severity: severityFilter,
  }) as Feedback[];

  return (
    <>
      <Topbar title="Feedback" />

      <main className="p-6 space-y-4">
        <Card>
          <form
            method="get"
            className="flex flex-wrap items-end gap-3 p-4"
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="status"
                className="text-[11px] uppercase tracking-wide text-text-dim"
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

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="severity"
                className="text-[11px] uppercase tracking-wide text-text-dim"
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

            <Button variant="primary" size="md" type="submit">
              Apply
            </Button>

            {(statusFilter || severityFilter) && (
              <Link href="/feedback">
                <Button variant="ghost" size="md" type="button">
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
                width: '40%',
                render: (r) => {
                  const full = snippet(r.message);
                  return (
                    <Link
                      href={`/feedback/${r.id}`}
                      className="text-text-base no-underline transition-colors hover:text-accent"
                    >
                      <span
                        className="block max-w-[420px] truncate"
                        title={full}
                      >
                        {full || '—'}
                      </span>
                    </Link>
                  );
                },
              },
              {
                key: 'contact',
                header: 'Contact',
                render: (r) => (
                  <span className="block max-w-[200px] truncate font-mono text-[13px] text-text-dim">
                    {r.contact || '—'}
                  </span>
                ),
              },
              {
                key: 'created_at',
                header: 'Created',
                align: 'right',
                render: (r) => (
                  <span className="tabular-nums text-text-dim">
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
                align: 'right',
                render: (r) => (
                  <Link
                    href={`/feedback/${r.id}`}
                    className="text-[13px] text-accent no-underline transition-colors hover:text-accent-2"
                  >
                    Open →
                  </Link>
                ),
              },
            ]}
          />
        </Card>
      </main>
    </>
  );
}
