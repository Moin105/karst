import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { insertPartner, type PartnerStatus } from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Link from 'next/link';

const VERTICALS = ['fintech', 'healthtech', 'platform', 'other'] as const;
const PARTNER_STATUSES: PartnerStatus[] = [
  'lead',
  'contacted',
  'demo_booked',
  'piloting',
  'paying',
  'lost',
];

export default async function NewPartnerPage() {
  await requireAdmin();

  async function createPartnerAction(formData: FormData) {
    'use server';
    await requireAdmin();
    const rawStatus = String(formData.get('status') || 'lead').trim();
    const status: PartnerStatus = (PARTNER_STATUSES as readonly string[]).includes(
      rawStatus
    )
      ? (rawStatus as PartnerStatus)
      : 'lead';
    const nullable = (v: string) => {
      const t = v.trim();
      return t ? t : undefined;
    };
    const created = await insertPartner({
      name: String(formData.get('name') || '').trim() || 'Untitled',
      email: nullable(String(formData.get('email') || '')),
      company: nullable(String(formData.get('company') || '')),
      vertical: nullable(String(formData.get('vertical') || 'other')),
      status,
      notes_md: nullable(String(formData.get('notes_md') || '')),
    });
    revalidatePath('/partners');
    redirect(`/partners/${created.id}`);
  }

  return (
    <>
      <Topbar
        title="Add Design Partner"
        actions={
          <Link href="/partners">
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </Link>
        }
      />
      <main className="p-6 space-y-4">
        <Card className="max-w-2xl p-6">
          <form action={createPartnerAction} className="space-y-4">
            <div>
              <label className="block text-xs text-text-dim mb-1">Name</label>
              <Input name="name" required placeholder="Jane Doe" />
            </div>

            <div>
              <label className="block text-xs text-text-dim mb-1">Email</label>
              <Input name="email" type="email" placeholder="jane@acme.com" />
            </div>

            <div>
              <label className="block text-xs text-text-dim mb-1">Company</label>
              <Input name="company" placeholder="Acme Inc." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-dim mb-1">Vertical</label>
                <Select name="vertical" defaultValue="other">
                  {VERTICALS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs text-text-dim mb-1">Status</label>
                <Select name="status" defaultValue="lead">
                  {PARTNER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-dim mb-1">
                Notes (markdown)
              </label>
              <Textarea
                name="notes_md"
                rows={8}
                placeholder="First contact via Twitter DM. Interested in monorepo support..."
                className="font-mono text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <Link href="/partners">
                <Button variant="ghost" size="sm" type="button">
                  Cancel
                </Button>
              </Link>
              <Button variant="primary" size="sm" type="submit">
                Create partner
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </>
  );
}
