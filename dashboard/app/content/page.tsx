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

  const rows = listBlogPosts();

  const draftCount = rows.filter((r) => r.status === 'draft').length;
  const publishedCount = rows.filter((r) => r.status === 'published').length;

  const columns = [
    {
      key: 'title',
      header: 'Title',
      render: (r: BlogPost) => (
        <Link
          href={`/content/${r.id}`}
          style={{
            color: 'var(--text)',
            fontWeight: 500,
            textDecoration: 'none',
            fontFamily: 'Inter, sans-serif',
          }}
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
          style={{
            color: 'var(--text-dim)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            textDecoration: 'none',
          }}
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
      render: (r: BlogPost) => (
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
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
          <Link href="/content/new" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="sm">
              New post
            </Button>
          </Link>
        }
      />
      <div
        style={{
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <Card>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-dim)',
                }}
              >
                Blog posts
              </div>
              <div
                style={{
                  fontSize: 16,
                  color: 'var(--text)',
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {rows.length} total
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Badge variant="success">{publishedCount} published</Badge>
              <Badge variant="warning">{draftCount} draft</Badge>
            </div>
          </div>
          <div style={{ padding: 0 }}>
            <DataTable
              rows={rows}
              columns={columns}
              emptyMessage="No posts yet. Click 'New post' to draft your first one."
            />
          </div>
        </Card>
      </div>
    </>
  );
}
