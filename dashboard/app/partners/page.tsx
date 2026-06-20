import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listPartners, Partner, PartnerStatus } from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/EmptyState';
import { formatRelative, statusColor } from '@/lib/format';

const STATUSES: { key: PartnerStatus; label: string }[] = [
  { key: 'lead', label: 'Lead' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'demo_booked', label: 'Demo booked' },
  { key: 'piloting', label: 'Piloting' },
  { key: 'paying', label: 'Paying' },
  { key: 'lost', label: 'Lost' },
];

export default async function PartnersPage() {
  await requireAdmin();
  const partners = (await listPartners()) as Partner[];

  const byStatus: Record<PartnerStatus, Partner[]> = {
    lead: [],
    contacted: [],
    demo_booked: [],
    piloting: [],
    paying: [],
    lost: [],
  };
  for (const p of partners) {
    const k = (p.status as PartnerStatus) in byStatus ? (p.status as PartnerStatus) : 'lead';
    byStatus[k].push(p);
  }

  return (
    <>
      <Topbar
        title="Design Partners"
        actions={
          <Link href="/partners/new">
            <Button variant="primary" size="sm">
              Add partner
            </Button>
          </Link>
        }
      />
      <main className="p-6 space-y-4">
        {partners.length === 0 ? (
          <EmptyState
            title="No design partners yet"
            description="Track leads through your pipeline from first contact to paying customer."
            action={
              <Link href="/partners/new">
                <Button variant="primary" size="sm">
                  Add your first partner
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {STATUSES.map(({ key, label }) => {
              const items = byStatus[key];
              return (
                <Card key={key} className="w-72 shrink-0 p-0 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border p-3">
                    <span className="text-[11px] uppercase tracking-wide font-medium text-text-dim">
                      {label}
                    </span>
                    <Badge variant={statusColor(key)}>
                      <span className="tabular-nums">{items.length}</span>
                    </Badge>
                  </div>
                  <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="text-xs px-2 py-4 text-center text-text-dim">
                        No partners
                      </p>
                    ) : (
                      items.map((p) => (
                        <Link
                          key={p.id}
                          href={`/partners/${p.id}`}
                          className="block rounded-lg border border-border bg-bg p-3 hover:border-accent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                        >
                          <div className="text-sm font-medium text-text-base">
                            {p.name}
                          </div>
                          {p.company && (
                            <div className="text-xs text-text-dim mt-0.5">
                              {p.company}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 mt-2">
                            {p.vertical ? (
                              <Badge variant="default">{p.vertical}</Badge>
                            ) : (
                              <span />
                            )}
                            <span className="text-xs text-text-dim tabular-nums">
                              {formatRelative(p.last_touch ?? p.created_at)}
                            </span>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
