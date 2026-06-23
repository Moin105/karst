'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type Platform = 'x' | 'reddit' | 'discord' | 'instagram';

const ALL_PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'x', label: 'X' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'discord', label: 'Discord' },
  { id: 'instagram', label: 'Instagram' },
];

async function trigger(payload: unknown): Promise<{ ok: boolean; error?: string; detail?: string }> {
  try {
    const res = await fetch('/api/social/trigger', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    return { ok: false, error: data?.error || `http_${res.status}`, detail: data?.detail };
  } catch (e) {
    return { ok: false, error: 'network', detail: e instanceof Error ? e.message : '' };
  }
}

function explain(error?: string, detail?: string): string {
  switch (error) {
    case 'n8n_unreachable':
      return `Could not reach n8n${detail ? ` (${detail})` : ''}. Is n8n running and is the workflow active?`;
    case 'unauthorized':
      return 'Session expired — reload and sign in again.';
    case 'not_approved':
      return 'Only approved posts can be published.';
    default:
      return `Something went wrong${error ? ` (${error})` : ''}.`;
  }
}

export function GeneratePanel() {
  const router = useRouter();
  const [theme, setTheme] = useState('');
  const [selected, setSelected] = useState<Platform[]>(['x', 'reddit', 'discord', 'instagram']);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function toggle(p: Platform) {
    setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  }

  async function onGenerate() {
    if (selected.length === 0) {
      setMsg({ kind: 'err', text: 'Pick at least one platform.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await trigger({ action: 'generate', theme: theme.trim(), platforms: selected });
    setBusy(false);
    if (r.ok) {
      // n8n acks immediately and writes drafts as each platform finishes, so we
      // can't report a workflow failure here — be honest and point at the log.
      setMsg({
        kind: 'ok',
        text: 'Generation started — drafts appear as they’re written. If none show in ~30s, check the n8n execution log.',
      });
      // Refresh a couple of times to pick up drafts as they land.
      setTimeout(() => startTransition(() => router.refresh()), 4000);
      setTimeout(() => startTransition(() => router.refresh()), 9000);
    } else {
      setMsg({ kind: 'err', text: explain(r.error, r.detail) });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="theme" className="text-[11px] uppercase tracking-wide text-text-dim">
          Theme / idea (optional)
        </label>
        <Input
          id="theme"
          placeholder="e.g. exact per-model token cost, or leave blank for karst's core message"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-text-dim">Platforms</span>
        <div className="flex flex-wrap gap-2">
          {ALL_PLATFORMS.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={
                  'h-8 px-3 rounded-lg border text-[13px] transition-colors ' +
                  (on
                    ? 'border-accent bg-accent/10 text-text-base'
                    : 'border-border text-text-dim hover:text-text-base hover:bg-white/5')
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" size="md" onClick={onGenerate} loading={busy || pending}>
          Generate drafts
        </Button>
        {msg && (
          <span className={'text-[13px] ' + (msg.kind === 'ok' ? 'text-accent-2' : 'text-red-400')}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

export function PublishButton({ id, disabled }: { id: number; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  async function onPublish() {
    setBusy(true);
    setMsg(null);
    const r = await trigger({ action: 'publish', id });
    setBusy(false);
    if (r.ok) {
      setMsg({ kind: 'ok', text: 'Publishing… status will update shortly.' });
      setTimeout(() => startTransition(() => router.refresh()), 3500);
    } else {
      setMsg({ kind: 'err', text: explain(r.error, r.detail) });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="primary" size="md" onClick={onPublish} loading={busy || pending} disabled={disabled}>
        Publish now
      </Button>
      {msg && (
        <span className={'text-[13px] ' + (msg.kind === 'ok' ? 'text-accent-2' : 'text-red-400')}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
