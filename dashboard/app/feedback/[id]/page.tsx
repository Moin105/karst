import { requireAdmin } from '@/lib/auth';
import { getFeedback, updateFeedback } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import MarkdownView from '@/components/MarkdownView';
import { formatDate, severityColor, statusColor } from '@/lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function isEmail(s?: string | null): boolean {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export default async function FeedbackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const fb = await getFeedback(Number(id));
  if (!fb) notFound();

  async function markTriaged() {
    'use server';
    await requireAdmin();
    await updateFeedback(fb!.id, { status: 'triaged' });
    redirect(`/feedback/${fb!.id}`);
  }

  async function markReplied() {
    'use server';
    await requireAdmin();
    await updateFeedback(fb!.id, { status: 'replied' });
    redirect(`/feedback/${fb!.id}`);
  }

  async function markClosed() {
    'use server';
    await requireAdmin();
    await updateFeedback(fb!.id, { status: 'closed' });
    redirect(`/feedback/${fb!.id}`);
  }

  const emailContact = isEmail(fb.contact);
  const quotedBody = (fb.message || '')
    .split('\n')
    .map((line) => '> ' + line)
    .join('\n');
  const mailtoHref = emailContact
    ? `mailto:${encodeURIComponent(
        fb.contact!,
      )}?subject=${encodeURIComponent('Re: karst feedback')}&body=${encodeURIComponent(
        '\n\n---\n' + quotedBody,
      )}`
    : null;

  return (
    <>
      <Topbar
        title={`Feedback #${fb.id}`}
        actions={
          <Link href="/feedback">
            <Button variant="ghost" size="sm">
              Back to inbox
            </Button>
          </Link>
        }
      />

      <main className="p-6 space-y-4">
        <Card>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={severityColor(fb.severity)}>
                {fb.severity ?? 'unset'}
              </Badge>
              <Badge variant="default">{fb.source}</Badge>
              <Badge variant={statusColor(fb.status)}>
                {fb.status ?? 'new'}
              </Badge>
              <span className="ml-auto font-mono text-[13px] tabular-nums text-text-dim">
                {formatDate(fb.created_at)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-border pt-4">
              <span className="text-[11px] uppercase tracking-wide text-text-dim">
                Contact
              </span>
              {fb.contact ? (
                emailContact ? (
                  <a
                    href={`mailto:${fb.contact}`}
                    className="font-mono text-[14px] text-accent no-underline transition-colors hover:text-accent-2"
                  >
                    {fb.contact}
                  </a>
                ) : (
                  <span className="font-mono text-[14px] text-text-base">
                    {fb.contact}
                  </span>
                )
              ) : (
                <span className="text-[14px] text-text-dim">None provided</span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-2.5 p-6">
            <span className="text-[11px] uppercase tracking-wide text-text-dim">
              Message
            </span>
            <div className="rounded-lg border border-border bg-code-bg p-4 text-text-base">
              <MarkdownView source={fb.message ?? ''} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center gap-2.5 p-4">
            <form action={markTriaged}>
              <Button variant="secondary" size="md">
                Mark triaged
              </Button>
            </form>
            <form action={markReplied}>
              <Button variant="secondary" size="md">
                Mark replied
              </Button>
            </form>
            <form action={markClosed}>
              <Button variant="danger" size="md">
                Mark closed
              </Button>
            </form>

            {mailtoHref && (
              <a href={mailtoHref} className="ml-auto">
                <Button variant="primary" size="md">
                  Reply via email
                </Button>
              </a>
            )}
          </div>
        </Card>
      </main>
    </>
  );
}
