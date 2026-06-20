import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import {
  getBlogPostById,
  updateBlogPost,
  type BlogStatus,
} from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import MarkdownView from '@/components/MarkdownView';

export const dynamic = 'force-dynamic';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '—';
  }
}

function statusVariant(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'published') return 'success';
  if (status === 'draft') return 'warning';
  return 'default';
}

async function updateBlogPostAction(formData: FormData) {
  'use server';
  await requireAdmin();

  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    redirect('/content');
  }

  const existing = getBlogPostById(id);
  if (!existing) {
    redirect('/content');
  }

  const title = String(formData.get('title') ?? existing!.title).trim();
  const body_md = String(formData.get('body_md') ?? existing!.body_md);
  const rawStatus = String(formData.get('status') ?? existing!.status);
  const status: BlogStatus = rawStatus === 'published' ? 'published' : 'draft';
  const slugInput = String(formData.get('slug') ?? '').trim();
  const slug = slugInput ? slugify(slugInput) : existing!.slug;

  updateBlogPost(id, { title, body_md, status, slug });
  revalidatePath('/content');
  revalidatePath(`/content/${id}`);
  redirect(`/content/${id}`);
}

async function toggleStatusAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const existing = getBlogPostById(id);
  if (!existing) redirect('/content');
  const next: BlogStatus =
    existing!.status === 'published' ? 'draft' : 'published';
  updateBlogPost(id, { status: next });
  revalidatePath('/content');
  revalidatePath(`/content/${id}`);
  redirect(`/content/${id}`);
}

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isFinite(postId) || postId <= 0) notFound();

  const post = getBlogPostById(postId);
  if (!post) notFound();

  return (
    <>
      <Topbar
        title={`Edit: ${post.title || '(untitled)'}`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge variant={statusVariant(post.status)}>{post.status}</Badge>
            <Link href="/content" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm">
                Back
              </Button>
            </Link>
          </div>
        }
      />
      <div
        style={{
          padding: 24,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* Edit form */}
        <Card>
          <form
            action={updateBlogPostAction}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              padding: 24,
            }}
          >
            <input type="hidden" name="id" value={post.id} />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <label
                htmlFor="title"
                style={{
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Title
              </label>
              <Input
                id="title"
                name="title"
                defaultValue={post.title}
                required
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <label
                htmlFor="slug"
                style={{
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Slug
              </label>
              <Input
                id="slug"
                name="slug"
                defaultValue={post.slug}
                className="font-mono"
              />
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-dim)',
                }}
              >
                Public URL: /blog/{post.slug}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <label
                htmlFor="body_md"
                style={{
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Body (markdown)
              </label>
              <Textarea
                id="body_md"
                name="body_md"
                className="h-80"
                defaultValue={post.body_md}
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxWidth: 240,
              }}
            >
              <label
                htmlFor="status"
                style={{
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Status
              </label>
              <Select
                id="status"
                name="status"
                defaultValue={post.status}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </Select>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                paddingTop: 8,
                borderTop: '1px solid var(--border)',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Button variant="primary" size="md" type="submit">
                Save changes
              </Button>

              <span style={{ flex: 1 }} />

              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                created {formatDate(post.created_at)}
              </span>
            </div>
          </form>

          <div
            style={{
              padding: 16,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <form action={toggleStatusAction}>
              <input type="hidden" name="id" value={post.id} />
              <Button
                variant={post.status === 'published' ? 'secondary' : 'primary'}
                size="sm"
                type="submit"
              >
                {post.status === 'published'
                  ? 'Unpublish (set to draft)'
                  : 'Publish now'}
              </Button>
            </form>
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              published_at: {formatDate(post.published_at)}
            </span>
          </div>
        </Card>

        {/* Preview */}
        <Card>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-dim)',
                }}
              >
                Preview
              </div>
              <div
                style={{
                  fontSize: 16,
                  color: 'var(--text)',
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {post.title || '(untitled)'}
              </div>
            </div>
            <Badge variant={statusVariant(post.status)}>{post.status}</Badge>
          </div>
          <div style={{ padding: 24 }}>
            {post.body_md && post.body_md.trim().length > 0 ? (
              <MarkdownView source={post.body_md} />
            ) : (
              <div
                style={{
                  color: 'var(--text-dim)',
                  fontSize: 13,
                  fontStyle: 'italic',
                }}
              >
                Empty body — write some markdown on the left to see the preview.
                Saving the form will rerender this side.
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
