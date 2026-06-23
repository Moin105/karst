import { requireAdmin } from '@/lib/auth';
import { getSocialPost, updateSocialPost, type SocialStatus } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { formatDate, statusColor, platformLabel } from '@/lib/format';
import { PublishButton } from '../SocialClient';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Rough per-platform character ceilings, shown as a guide (not enforced).
const LIMIT: Record<string, number> = { x: 280, reddit: 40000, discord: 2000, instagram: 2200 };

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
}

export default async function SocialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const post = await getSocialPost(Number(id));
  if (!post) notFound();

  async function saveEdits(formData: FormData) {
    'use server';
    await requireAdmin();
    await updateSocialPost(post!.id, {
      title: str(formData.get('title')),
      body: (str(formData.get('body')) ?? '') || post!.body,
      hashtags: str(formData.get('hashtags')),
      link: str(formData.get('link')),
      media_hint: str(formData.get('media_hint')),
    });
    redirect(`/social/${post!.id}`);
  }

  async function setStatus(status: SocialStatus) {
    'use server';
    await requireAdmin();
    await updateSocialPost(post!.id, { status });
    redirect(`/social/${post!.id}`);
  }
  async function approve() {
    'use server';
    await setStatus('approved');
  }
  async function reject() {
    'use server';
    await setStatus('rejected');
  }

  const limit = LIMIT[post.platform] ?? 0;
  const over = limit > 0 && post.body.length > limit;

  return (
    <>
      <Topbar
        title={`${platformLabel(post.platform)} post #${post.id}`}
        actions={
          <Link href="/social">
            <Button variant="ghost" size="sm">
              Back to queue
            </Button>
          </Link>
        }
      />

      <main className="p-6 space-y-4">
        <Card>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{platformLabel(post.platform)}</Badge>
              <Badge variant={statusColor(post.status)}>{post.status}</Badge>
              {post.theme && <span className="text-[13px] text-text-dim">theme: {post.theme}</span>}
              <span className="ml-auto font-mono text-[13px] tabular-nums text-text-dim">
                {formatDate(post.created_at)}
              </span>
            </div>

            {post.status === 'posted' && post.external_url && (
              <div className="border-t border-border pt-4">
                <a
                  href={post.external_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[14px] text-accent no-underline hover:text-accent-2"
                >
                  View live post ↗
                </a>
              </div>
            )}
            {post.status === 'failed' && post.error && (
              <div className="border-t border-border pt-4 text-[13px] text-red-400">
                Publish failed: {post.error}
              </div>
            )}
          </div>
        </Card>

        {/* Edit */}
        <Card>
          <form action={saveEdits} className="flex flex-col gap-4 p-6">
            <span className="text-[11px] uppercase tracking-wide text-text-dim">Edit draft</span>

            {post.platform === 'reddit' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="title" className="text-[12px] text-text-dim">
                  Title (Reddit)
                </label>
                <Input id="title" name="title" defaultValue={post.title ?? ''} placeholder="Post title" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="body" className="text-[12px] text-text-dim">
                  Body
                </label>
                {limit > 0 && (
                  <span className={'text-[11px] tabular-nums ' + (over ? 'text-red-400' : 'text-text-dim')}>
                    {post.body.length} / {limit}
                  </span>
                )}
              </div>
              <Textarea id="body" name="body" defaultValue={post.body} rows={8} className="min-h-[180px]" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="hashtags" className="text-[12px] text-text-dim">
                  Hashtags (X / Instagram)
                </label>
                <Input id="hashtags" name="hashtags" defaultValue={post.hashtags ?? ''} placeholder="#devtools #AI" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="link" className="text-[12px] text-text-dim">
                  Link
                </label>
                <Input id="link" name="link" defaultValue={post.link ?? ''} placeholder="https://karst.dev" />
              </div>
            </div>

            {post.platform === 'instagram' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="media_hint" className="text-[12px] text-text-dim">
                  Image asset (Instagram requires media)
                </label>
                <Input
                  id="media_hint"
                  name="media_hint"
                  defaultValue={post.media_hint ?? ''}
                  placeholder="URL of a marketing image to attach"
                />
              </div>
            )}

            <div>
              <Button variant="secondary" size="md" type="submit">
                Save edits
              </Button>
            </div>
          </form>
        </Card>

        {/* Review + publish */}
        <Card>
          <div className="flex flex-wrap items-center gap-2.5 p-4">
            <form action={approve}>
              <Button variant="secondary" size="md" disabled={post.status === 'approved'}>
                Approve
              </Button>
            </form>
            <form action={reject}>
              <Button variant="danger" size="md" disabled={post.status === 'rejected'}>
                Reject
              </Button>
            </form>
            <div className="ml-auto">
              <PublishButton id={post.id} disabled={post.status !== 'approved'} />
            </div>
          </div>
          {post.status !== 'approved' && (
            <p className="px-4 pb-4 text-[12px] text-text-dim">
              Approve the post to enable publishing.
            </p>
          )}
        </Card>
      </main>
    </>
  );
}
