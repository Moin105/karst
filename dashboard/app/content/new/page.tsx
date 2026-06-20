import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import {
  insertBlogPost,
  getBlogPostBySlug,
  type BlogStatus,
} from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';

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

function uniqueSlug(base: string): string {
  let candidate = base || `post-${Date.now()}`;
  let i = 2;
  while (getBlogPostBySlug(candidate)) {
    candidate = `${base}-${i}`;
    i += 1;
  }
  return candidate;
}

async function createPostAction(formData: FormData) {
  'use server';
  await requireAdmin();

  const title = String(formData.get('title') ?? '').trim();
  const body_md = String(formData.get('body_md') ?? '');
  const rawStatus = String(formData.get('status') ?? 'draft');
  const status: BlogStatus = rawStatus === 'published' ? 'published' : 'draft';

  if (!title) {
    redirect('/content/new?error=title-required');
  }

  const baseSlug = slugify(title);
  const slug = uniqueSlug(baseSlug);

  insertBlogPost({ slug, title, body_md, status });
  revalidatePath('/content');
  redirect('/content');
}

export default async function NewContentPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const error = params.error;

  return (
    <>
      <Topbar
        title="New post"
        actions={
          <Link href="/content" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="sm">
              Cancel
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
          maxWidth: 960,
        }}
      >
        <Card>
          <form
            action={createPostAction}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              padding: 24,
            }}
          >
            {error && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 8,
                  padding: 12,
                  color: '#fca5a5',
                  fontSize: 13,
                }}
              >
                {error === 'title-required'
                  ? 'Title is required.'
                  : 'Could not create post.'}
              </div>
            )}

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
                placeholder="How karst keeps your AI dev tools in sync"
                required
                autoFocus
              />
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-dim)',
                }}
              >
                Slug will be generated automatically from the title.
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
                placeholder={`# Heading\n\nWrite the post body in markdown. Numbers over adjectives — e.g. "343s → 2.3s incremental reindex".`}
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
              <Select id="status" name="status" defaultValue="draft">
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
              }}
            >
              <Button variant="primary" size="md" type="submit">
                Create post
              </Button>
              <Link href="/content" style={{ textDecoration: 'none' }}>
                <Button variant="ghost" size="md" type="button">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
