import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import {
  getPartner,
  updatePartner,
  type Partner,
  type PartnerStatus,
} from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import MarkdownView from '@/components/MarkdownView';
import { formatDate, statusColor } from '@/lib/format';

const VERTICALS = ['fintech', 'healthtech', 'platform', 'other'] as const;
const PARTNER_STATUSES: PartnerStatus[] = [
  'lead',
  'contacted',
  'demo_booked',
  'piloting',
  'paying',
  'lost',
];

function coerceStatus(raw: string, fallback: PartnerStatus): PartnerStatus {
  return (PARTNER_STATUSES as readonly string[]).includes(raw)
    ? (raw as PartnerStatus)
    : fallback;
}

function nullableString(raw: string): string | null {
  const v = raw.trim();
  return v ? v : null;
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id: idStr } = await params;
  const id = Number(idStr);
  const partner = (await getPartner(id)) as Partner | null;
  if (!partner) notFound();

  async function updatePartnerAction(formData: FormData) {
    'use server';
    await requireAdmin();
    const status = coerceStatus(
      String(formData.get('status') || '').trim(),
      partner!.status
    );
    const patch: Partial<Partner> = {
      name: String(formData.get('name') || '').trim() || partner!.name,
      email: nullableString(String(formData.get('email') || '')),
      company: nullableString(String(formData.get('company') || '')),
      vertical: nullableString(String(formData.get('vertical') || '')),
      status,
      notes_md: String(formData.get('notes_md') || ''),
      last_touch: Date.now(),
    };
    await updatePartner(id, patch);
    revalidatePath('/partners');
    revalidatePath(`/partners/${id}`);
  }

  const mailto = `mailto:${encodeURIComponent(
    partner.email || ''
  )}?subject=${encodeURIComponent('karst follow-up')}`;

  return (
    <div className="flex flex-col" style={{ color: 'var(--text)' }}>
      <Topbar title={partner.name} />
      <form action={updatePartnerAction} className="p-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card style={{ background: 'var(--surface)' }} className="p-6">
            <div
              className="text-xs uppercase tracking-wide font-semibold mb-4"
              style={{ color: 'var(--text-dim)' }}
            >
              Details
            </div>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-xs mb-1 font-medium"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Name
                </label>
                <Input name="name" defaultValue={partner.name} required />
              </div>
              <div>
                <label
                  className="block text-xs mb-1 font-medium"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Email
                </label>
                <Input
                  name="email"
                  type="email"
                  defaultValue={partner.email || ''}
                />
                {partner.email && (
                  <a
                    href={`mailto:${partner.email}`}
                    className="text-xs mt-1 inline-block"
                    style={{ color: 'var(--accent)' }}
                  >
                    {partner.email}
                  </a>
                )}
              </div>
              <div>
                <label
                  className="block text-xs mb-1 font-medium"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Company
                </label>
                <Input name="company" defaultValue={partner.company || ''} />
              </div>
              <div>
                <label
                  className="block text-xs mb-1 font-medium"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Vertical
                </label>
                <Select
                  name="vertical"
                  defaultValue={partner.vertical || 'other'}
                >
                  {VERTICALS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label
                  className="block text-xs mb-1 font-medium"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Status
                </label>
                <div className="flex items-center gap-3">
                  <Select
                    name="status"
                    defaultValue={partner.status || 'lead'}
                    className="flex-1"
                  >
                    {PARTNER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                  <Badge variant={statusColor(partner.status || 'lead')}>
                    {partner.status || 'lead'}
                  </Badge>
                </div>
              </div>
              <div>
                <div
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Created
                </div>
                <div className="text-sm mt-1">
                  {formatDate(partner.created_at)}
                </div>
              </div>
            </div>
          </Card>

          <Card style={{ background: 'var(--surface)' }} className="p-6">
            <div
              className="text-xs uppercase tracking-wide font-semibold mb-4"
              style={{ color: 'var(--text-dim)' }}
            >
              Notes
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label
                  className="block text-xs mb-1 font-medium"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Edit (markdown)
                </label>
                <Textarea
                  name="notes_md"
                  rows={10}
                  defaultValue={partner.notes_md || ''}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <div
                  className="block text-xs mb-2 font-medium"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Preview
                </div>
                <div
                  className="rounded-lg p-4 border"
                  style={{
                    background: 'var(--bg)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {partner.notes_md ? (
                    <MarkdownView source={partner.notes_md} />
                  ) : (
                    <p
                      className="text-sm"
                      style={{ color: 'var(--text-dim)' }}
                    >
                      No notes yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex items-center justify-between mt-6">
          <a href={mailto}>
            <Button variant="secondary" type="button">
              Send email
            </Button>
          </a>
          <Button variant="primary" type="submit">
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
