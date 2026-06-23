import { requireAdmin } from '@/lib/auth';
import {
  listSocialPosts,
  type SocialPost,
  type SocialPlatform,
  type SocialStatus,
} from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/DataTable';
import { formatRelative, statusColor, platformLabel } from '@/lib/format';
import { GeneratePanel } from './SocialClient';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const PLATFORMS: SocialPlatform[] = ['x', 'reddit', 'discord', 'instagram'];
const STATUSES: SocialStatus[] = ['draft', 'approved', 'rejected', 'posted', 'failed'];

function coercePlatform(raw: string | undefined): SocialPlatform | undefined {
  return raw && (PLATFORMS as readonly string[]).includes(raw) ? (raw as SocialPlatform) : undefined;
}
function coerceStatus(raw: string | undefined): SocialStatus | undefined {
  return raw && (STATUSES as readonly string[]).includes(raw) ? (raw as SocialStatus) : undefined;
}

function snippet(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export default async function SocialListPage({
  searchParams,
}: {
  searchParams?: Promise<{ platform?: string; status?: string }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const platformFilter = coercePlatform(sp.platform);
  const statusFilter = coerceStatus(sp.status);

  const rows = (await listSocialPosts({
    platform: platformFilter,
    status: statusFilter,
  })) as SocialPost[];

  return (
    <>
      <Topbar
        title="Social"
        actions={
          <Link href="/social/accounts">
            <Button variant="secondary" size="sm">
              Handles & accounts
            </Button>
          </Link>
        }
      />

      <main className="p-6 space-y-4">
        <Card>
          <div className="flex items-center justify-between gap-3 px-6 pt-5">
            <div>
              <h2 className="text-sm font-semibold text-text-base">Generate drafts</h2>
              <p className="text-[13px] text-text-dim">
                Fires your n8n workflow. Claude writes a post per platform on the karst theme; drafts
                land below for review.
              </p>
            </div>
          </div>
          <GeneratePanel />
        </Card>

        <Card>
          <form method="get" className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="platform" className="text-[11px] uppercase tracking-wide text-text-dim">
                Platform
              </label>
              <Select id="platform" name="platform" defaultValue={platformFilter ?? ''} className="min-w-[150px]">
                <option value="">All</option>
                <option value="x">X</option>
                <option value="reddit">Reddit</option>
                <option value="discord">Discord</option>
                <option value="instagram">Instagram</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="status" className="text-[11px] uppercase tracking-wide text-text-dim">
                Status
              </label>
              <Select id="status" name="status" defaultValue={statusFilter ?? ''} className="min-w-[150px]">
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="posted">Posted</option>
                <option value="failed">Failed</option>
              </Select>
            </div>

            <Button variant="primary" size="md" type="submit">
              Apply
            </Button>

            {(platformFilter || statusFilter) && (
              <Link href="/social">
                <Button variant="ghost" size="md" type="button">
                  Clear
                </Button>
              </Link>
            )}
          </form>
        </Card>

        <Card>
          <DataTable<SocialPost>
            rows={rows}
            emptyMessage="No posts yet. Use “Generate drafts” above to create some."
            columns={[
              {
                key: 'platform',
                header: 'Platform',
                render: (r) => <Badge variant="default">{platformLabel(r.platform)}</Badge>,
              },
              {
                key: 'body',
                header: 'Post',
                width: '42%',
                render: (r) => {
                  const full = snippet(r.title ? `${r.title} — ${r.body}` : r.body);
                  return (
                    <Link
                      href={`/social/${r.id}`}
                      className="text-text-base no-underline transition-colors hover:text-accent"
                    >
                      <span className="block max-w-[460px] truncate" title={full}>
                        {full || '—'}
                      </span>
                    </Link>
                  );
                },
              },
              {
                key: 'theme',
                header: 'Theme',
                render: (r) => (
                  <span className="block max-w-[180px] truncate text-[13px] text-text-dim" title={r.theme ?? ''}>
                    {r.theme || '—'}
                  </span>
                ),
              },
              {
                key: 'created_at',
                header: 'Created',
                align: 'right',
                render: (r) => <span className="tabular-nums text-text-dim">{formatRelative(r.created_at)}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <Badge variant={statusColor(r.status)}>{r.status}</Badge>,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) => (
                  <Link
                    href={`/social/${r.id}`}
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
