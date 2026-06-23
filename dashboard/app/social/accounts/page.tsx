import { requireAdmin } from '@/lib/auth';
import {
  listSocialAccounts,
  upsertSocialAccount,
  type SocialAccount,
  type SocialPlatform,
} from '@/lib/db';
import { redirect } from 'next/navigation';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { platformLabel } from '@/lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const PLATFORMS: SocialPlatform[] = ['x', 'reddit', 'discord', 'instagram'];

const HANDLE_HINT: Record<SocialPlatform, string> = {
  x: '@karst',
  reddit: 'u/karst',
  discord: 'karst community',
  instagram: '@karst',
};
const TARGET_HINT: Record<SocialPlatform, string> = {
  x: '(not used)',
  reddit: 'subreddit, e.g. r/devtools',
  discord: 'channel name (optional)',
  instagram: '(not used)',
};

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
}

export default async function SocialAccountsPage() {
  await requireAdmin();
  const existing = (await listSocialAccounts()) as SocialAccount[];
  const byPlatform = new Map(existing.map((a) => [a.platform, a]));

  async function save(formData: FormData) {
    'use server';
    await requireAdmin();
    const platform = String(formData.get('platform') || '') as SocialPlatform;
    if (!PLATFORMS.includes(platform)) return;
    await upsertSocialAccount({
      platform,
      handle: str(formData.get('handle')),
      profile_url: str(formData.get('profile_url')),
      target: str(formData.get('target')),
      enabled: formData.get('enabled') === 'on',
      notes: str(formData.get('notes')),
    });
    redirect('/social/accounts');
  }

  return (
    <>
      <Topbar
        title="Social handles"
        actions={
          <Link href="/social">
            <Button variant="ghost" size="sm">
              Back to queue
            </Button>
          </Link>
        }
      />

      <main className="p-6 space-y-4">
        <p className="max-w-2xl text-[13px] text-text-dim">
          Your public handles and routing targets per channel. These are non-secret — API keys,
          webhook URLs and OAuth tokens live in your n8n credentials, never here.
        </p>

        {PLATFORMS.map((p) => {
          const a = byPlatform.get(p);
          return (
            <Card key={p}>
              <form action={save} className="flex flex-col gap-4 p-6">
                <input type="hidden" name="platform" value={p} />
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text-base">{platformLabel(p)}</h2>
                  <label className="flex items-center gap-2 text-[13px] text-text-dim">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={a ? a.enabled === 1 : true}
                      className="h-4 w-4 accent-[var(--accent,#818cf8)]"
                    />
                    Enabled
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] text-text-dim">Handle</label>
                    <Input name="handle" defaultValue={a?.handle ?? ''} placeholder={HANDLE_HINT[p]} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] text-text-dim">Profile URL</label>
                    <Input name="profile_url" defaultValue={a?.profile_url ?? ''} placeholder="https://…" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] text-text-dim">Target</label>
                    <Input name="target" defaultValue={a?.target ?? ''} placeholder={TARGET_HINT[p]} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] text-text-dim">Notes</label>
                    <Input name="notes" defaultValue={a?.notes ?? ''} placeholder="optional" />
                  </div>
                </div>

                <div>
                  <Button variant="secondary" size="md" type="submit">
                    Save {platformLabel(p)}
                  </Button>
                </div>
              </form>
            </Card>
          );
        })}
      </main>
    </>
  );
}
