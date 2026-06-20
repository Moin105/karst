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
  const fb = getFeedback(Number(id));
  if (!fb) notFound();

  async function markTriaged() {
    'use server';
    await requireAdmin();
    updateFeedback(fb!.id, { status: 'triaged' });
    redirect(`/feedback/${fb!.id}`);
  }

  async function markReplied() {
    'use server';
    await requireAdmin();
    updateFeedback(fb!.id, { status: 'replied' });
    redirect(`/feedback/${fb!.id}`);
  }

  async function markClosed() {
    'use server';
    await requireAdmin();
    updateFeedback(fb!.id, { status: 'closed' });
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
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

      <Card>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            padding: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Badge variant={severityColor(fb.severity)}>
              severity: {fb.severity ?? 'unset'}
            </Badge>
            <Badge variant="default">source: {fb.source}</Badge>
            <Badge variant={statusColor(fb.status)}>
              status: {fb.status ?? 'new'}
            </Badge>
            <span
              style={{
                color: 'var(--text-dim)',
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {formatDate(fb.created_at)}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              borderTop: '1px solid var(--border)',
              paddingTop: 16,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Contact
            </span>
            {fb.contact ? (
              emailContact ? (
                <a
                  href={`mailto:${fb.contact}`}
                  style={{
                    color: 'var(--accent)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 14,
                    textDecoration: 'none',
                  }}
                >
                  {fb.contact}
                </a>
              ) : (
                <span
                  style={{
                    color: 'var(--text)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 14,
                  }}
                >
                  {fb.contact}
                </span>
              )
            ) : (
              <span style={{ color: 'var(--text-dim)' }}>None provided</span>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              borderTop: '1px solid var(--border)',
              paddingTop: 16,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Message
            </span>
            <div
              style={{
                background: 'var(--code-bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 16,
                color: 'var(--text)',
              }}
            >
              <MarkdownView source={fb.message ?? ''} />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            padding: 16,
            alignItems: 'center',
          }}
        >
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
            <a href={mailtoHref} style={{ marginLeft: 'auto' }}>
              <Button variant="primary" size="md">
                Reply via email
              </Button>
            </a>
          )}
        </div>
      </Card>
    </div>
  );
}
