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
    <>
      <Topbar
        title={partner.name}
        actions={
          <Badge variant={statusColor(partner.status || 'lead')}>
            {partner.status || 'lead'}
          </Badge>
        }
      />
      <main className="p-6 space-y-4">
        <form action={updatePartnerAction} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-6">
              <div className="text-[11px] uppercase tracking-wide text-text-dim mb-4">
                Details
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-text-dim mb-1">Name</label>
                  <Input name="name" defaultValue={partner.name} required />
                </div>
                <div>
                  <label className="block text-xs text-text-dim mb-1">Email</label>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={partner.email || ''}
                  />
                  {partner.email && (
                    <a
                      href={`mailto:${partner.email}`}
                      className="text-xs text-accent mt-1 inline-block hover:underline"
                    >
                      {partner.email}
                    </a>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-text-dim mb-1">Company</label>
                  <Input name="company" defaultValue={partner.company || ''} />
                </div>
                <div>
                  <label className="block text-xs text-text-dim mb-1">Vertical</label>
                  <Select name="vertical" defaultValue={partner.vertical || 'other'}>
                    {VERTICALS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-text-dim mb-1">Status</label>
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
                  <div className="text-xs text-text-dim mb-1">Created</div>
                  <div className="text-sm tabular-nums">
                    {formatDate(partner.created_at)}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="text-[11px] uppercase tracking-wide text-text-dim mb-4">
                Notes
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-text-dim mb-1">
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
                  <div className="block text-xs text-text-dim mb-2">Preview</div>
                  <div className="rounded-lg border border-border bg-bg p-4">
                    {partner.notes_md ? (
                      <MarkdownView source={partner.notes_md} />
                    ) : (
                      <p className="text-sm text-text-dim">No notes yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex items-center justify-between">
            <a href={mailto}>
              <Button variant="secondary" size="sm" type="button">
                Send email
              </Button>
            </a>
            <Button variant="primary" size="sm" type="submit">
              Save
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
