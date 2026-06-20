import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listPartners, Partner, PartnerStatus } from '@/lib/db';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/EmptyState';
import { formatRelative } from '@/lib/format';

const STATUSES: { key: PartnerStatus; label: string }[] = [
  { key: 'lead', label: 'Lead' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'demo_booked', label: 'Demo booked' },
  { key: 'piloting', label: 'Piloting' },
  { key: 'paying', label: 'Paying' },
  { key: 'lost', label: 'Lost' },
];

function statusBadgeVariant(status: string): 'default' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'paying':
      return 'success';
    case 'piloting':
    case 'demo_booked':
      return 'warning';
    case 'lost':
      return 'danger';
    default:
      return 'default';
  }
}

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
    <div className="flex flex-col" style={{ color: 'var(--text)' }}>
      <main className="flex-1 flex flex-col">
        <Topbar
          title="Design Partners"
          actions={
            <Link href="/partners/new">
              <Button variant="primary">Add partner</Button>
            </Link>
          }
        />
        <div className="p-6 flex-1 overflow-hidden">
          {partners.length === 0 ? (
            <EmptyState
              title="No design partners yet"
              description="Track leads through your pipeline from first contact to paying customer."
              action={
                <Link href="/partners/new">
                  <Button variant="primary">Add your first partner</Button>
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4 min-w-max">
                {STATUSES.map(({ key, label }) => {
                  const items = byStatus[key];
                  return (
                    <Card
                      key={key}
                      className="w-80 flex-shrink-0"
                      style={{ background: 'var(--surface)' }}
                    >
                      <div
                        className="flex items-center justify-between px-4 py-3 border-b"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <h3 className="font-semibold text-sm uppercase tracking-wide">{label}</h3>
                        <Badge variant={statusBadgeVariant(key)}>{items.length}</Badge>
                      </div>
                      <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
                        {items.length === 0 ? (
                          <p
                            className="text-xs px-2 py-4 text-center"
                            style={{ color: 'var(--text-dim)' }}
                          >
                            No partners
                          </p>
                        ) : (
                          items.map((p) => (
                            <Link
                              key={p.id}
                              href={`/partners/${p.id}`}
                              className="block rounded-lg p-3 border transition-colors hover:border-accent"
                              style={{
                                background: 'var(--bg)',
                                borderColor: 'var(--border)',
                              }}
                            >
                              <div className="font-semibold text-sm">{p.name}</div>
                              <div
                                className="text-xs mt-0.5"
                                style={{ color: 'var(--text-dim)' }}
                              >
                                {p.company}
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                {p.vertical ? (
                                  <Badge variant="default">{p.vertical}</Badge>
                                ) : (
                                  <span />
                                )}
                                <span
                                  className="text-xs"
                                  style={{ color: 'var(--text-dim)' }}
                                >
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
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
