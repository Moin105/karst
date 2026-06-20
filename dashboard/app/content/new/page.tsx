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
          <Link href="/content">
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </Link>
        }
      />
      <main className="p-6 space-y-4">
        <Card className="max-w-3xl p-6">
          <form action={createPostAction} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-[13px] text-red-300">
                {error === 'title-required'
                  ? 'Title is required.'
                  : 'Could not create post.'}
              </div>
            )}

            <div>
              <label
                htmlFor="title"
                className="block text-xs text-text-dim mb-1"
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
              <span className="text-xs text-text-dim mt-1 inline-block">
                Slug will be generated automatically from the title.
              </span>
            </div>

            <div>
              <label
                htmlFor="body_md"
                className="block text-xs text-text-dim mb-1"
              >
                Body (markdown)
              </label>
              <Textarea
                id="body_md"
                name="body_md"
                className="h-80 font-mono text-sm"
                placeholder={`# Heading\n\nWrite the post body in markdown. Numbers over adjectives — e.g. "343s → 2.3s incremental reindex".`}
              />
            </div>

            <div className="max-w-[240px]">
              <label
                htmlFor="status"
                className="block text-xs text-text-dim mb-1"
              >
                Status
              </label>
              <Select id="status" name="status" defaultValue="draft">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </Select>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <Button variant="primary" size="sm" type="submit">
                Create post
              </Button>
              <Link href="/content">
                <Button variant="ghost" size="sm" type="button">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </Card>
      </main>
    </>
  );
}
