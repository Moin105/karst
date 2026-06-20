import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listBlogPosts, type BlogPost } from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/DataTable';
import { formatRelative, statusColor } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  await requireAdmin();

  const rows = await listBlogPosts();

  const draftCount = rows.filter((r) => r.status === 'draft').length;
  const publishedCount = rows.filter((r) => r.status === 'published').length;

  const columns = [
    {
      key: 'title',
      header: 'Title',
      render: (r: BlogPost) => (
        <Link
          href={`/content/${r.id}`}
          className="font-medium text-text-base hover:text-accent transition-colors"
        >
          {r.title || '(untitled)'}
        </Link>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (r: BlogPost) => (
        <Link
          href={`/content/${r.id}`}
          className="font-mono text-[13px] text-text-dim hover:text-accent transition-colors"
        >
          /{r.slug}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: BlogPost) => (
        <Badge variant={statusColor(r.status)}>{r.status}</Badge>
      ),
    },
    {
      key: 'published',
      header: 'Published',
      align: 'right' as const,
      render: (r: BlogPost) => (
        <span className="text-[13px] text-text-dim tabular-nums">
          {formatRelative(r.published_at)}
        </span>
      ),
    },
  ];

  return (
    <>
      <Topbar
        title="Content"
        actions={
          <Link href="/content/new">
            <Button variant="primary" size="sm">
              New post
            </Button>
          </Link>
        }
      />
      <main className="p-6 space-y-4">
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border p-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-text-dim">
                Blog posts
              </div>
              <div className="text-sm font-medium text-text-base mt-0.5 tabular-nums">
                {rows.length} total
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success">
                <span className="tabular-nums">{publishedCount}</span> published
              </Badge>
              <Badge variant="warning">
                <span className="tabular-nums">{draftCount}</span> draft
              </Badge>
            </div>
          </div>
          <DataTable
            rows={rows}
            columns={columns}
            emptyMessage="No posts yet. Click 'New post' to draft your first one."
          />
        </Card>
      </main>
    </>
  );
}
