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

  const existing = await getBlogPostById(id);
  if (!existing) {
    redirect('/content');
  }

  const title = String(formData.get('title') ?? existing!.title).trim();
  const body_md = String(formData.get('body_md') ?? existing!.body_md);
  const rawStatus = String(formData.get('status') ?? existing!.status);
  const status: BlogStatus = rawStatus === 'published' ? 'published' : 'draft';
  const slugInput = String(formData.get('slug') ?? '').trim();
  const slug = slugInput ? slugify(slugInput) : existing!.slug;

  await updateBlogPost(id, { title, body_md, status, slug });
  revalidatePath('/content');
  revalidatePath(`/content/${id}`);
  redirect(`/content/${id}`);
}

async function toggleStatusAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const existing = await getBlogPostById(id);
  if (!existing) redirect('/content');
  const next: BlogStatus =
    existing!.status === 'published' ? 'draft' : 'published';
  await updateBlogPost(id, { status: next });
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

  const post = await getBlogPostById(postId);
  if (!post) notFound();

  return (
    <>
      <Topbar
        title={`Edit: ${post.title || '(untitled)'}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant(post.status)}>{post.status}</Badge>
            <Link href="/content">
              <Button variant="ghost" size="sm">
                Back
              </Button>
            </Link>
          </div>
        }
      />
      <main className="p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Edit form */}
          <Card className="p-0 overflow-hidden">
            <form action={updateBlogPostAction} className="space-y-4 p-6">
              <input type="hidden" name="id" value={post.id} />

              <div>
                <label htmlFor="title" className="block text-xs text-text-dim mb-1">
                  Title
                </label>
                <Input id="title" name="title" defaultValue={post.title} required />
              </div>

              <div>
                <label htmlFor="slug" className="block text-xs text-text-dim mb-1">
                  Slug
                </label>
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={post.slug}
                  className="font-mono"
                />
                <span className="text-xs text-text-dim mt-1 inline-block">
                  Public URL: /blog/{post.slug}
                </span>
              </div>

              <div>
                <label htmlFor="body_md" className="block text-xs text-text-dim mb-1">
                  Body (markdown)
                </label>
                <Textarea
                  id="body_md"
                  name="body_md"
                  className="h-80 font-mono text-sm"
                  defaultValue={post.body_md}
                />
              </div>

              <div className="max-w-[240px]">
                <label htmlFor="status" className="block text-xs text-text-dim mb-1">
                  Status
                </label>
                <Select id="status" name="status" defaultValue={post.status}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </Select>
              </div>

              <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border">
                <Button variant="primary" size="sm" type="submit">
                  Save changes
                </Button>
                <span className="flex-1" />
                <span className="text-xs text-text-dim font-mono tabular-nums">
                  created {formatDate(post.created_at)}
                </span>
              </div>
            </form>

            <div className="flex items-center gap-3 flex-wrap border-t border-border p-3">
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
              <span className="text-xs text-text-dim font-mono tabular-nums">
                published_at: {formatDate(post.published_at)}
              </span>
            </div>
          </Card>

          {/* Preview */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border p-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-text-dim">
                  Preview
                </div>
                <div className="text-sm font-medium text-text-base mt-0.5">
                  {post.title || '(untitled)'}
                </div>
              </div>
              <Badge variant={statusVariant(post.status)}>{post.status}</Badge>
            </div>
            <div className="p-6">
              {post.body_md && post.body_md.trim().length > 0 ? (
                <MarkdownView source={post.body_md} />
              ) : (
                <div className="text-[13px] italic text-text-dim">
                  Empty body — write some markdown on the left to see the preview.
                  Saving the form will rerender this side.
                </div>
              )}
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}
