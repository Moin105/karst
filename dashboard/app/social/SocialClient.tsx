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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trigger(payload: unknown): Promise<{ httpOk: boolean; data: any }> {
  try {
    const res = await fetch('/api/social/trigger', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { httpOk: res.ok, data };
  } catch (e) {
    return { httpOk: false, data: { error: 'network', detail: e instanceof Error ? e.message : '' } };
  }
}

function explain(error?: string, detail?: string): string {
  switch (error) {
    case 'n8n_unreachable':
      return `Could not reach n8n${detail ? ` (${detail})` : ''}. Is n8n running, the workflow active, and KARST_N8N_BASE_URL pointed at a reachable URL?`;
    case 'generation_failed':
      return `Generation failed${detail ? ` — ${detail}` : ''}. Is ANTHROPIC_API_KEY set on the dashboard?`;
    case 'unauthorized':
      return 'Session expired — reload and sign in again.';
    case 'not_approved':
      return 'Only approved posts can be published.';
    case 'not_found':
      return 'Post not found.';
    default:
      return `Something went wrong${error ? ` (${error})` : ''}${detail ? `: ${detail}` : ''}.`;
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
    const { httpOk, data } = await trigger({ action: 'generate', theme: theme.trim(), platforms: selected });
    setBusy(false);
    if (httpOk && data.ok && data.via === 'n8n') {
      // n8n acks immediately; drafts arrive via the ingest webhook as each finishes.
      setMsg({ kind: 'ok', text: 'Generation started via n8n — drafts appear shortly.' });
      setTimeout(() => startTransition(() => router.refresh()), 4000);
      setTimeout(() => startTransition(() => router.refresh()), 9000);
    } else if (httpOk && data.ok) {
      const n = data.created ?? 0;
      const failed = Array.isArray(data.errors) ? data.errors.length : 0;
      setMsg({
        kind: 'ok',
        text: `Generated ${n} draft${n === 1 ? '' : 's'}${failed ? ` (${failed} platform${failed === 1 ? '' : 's'} failed)` : ''}.`,
      });
      startTransition(() => router.refresh());
    } else {
      setMsg({ kind: 'err', text: explain(data.error, data.detail) });
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
    const { httpOk, data } = await trigger({ action: 'publish', id });
    setBusy(false);
    if (httpOk && data.ok && data.via === 'n8n') {
      setMsg({ kind: 'ok', text: 'Publishing via n8n — status will update shortly.' });
      setTimeout(() => startTransition(() => router.refresh()), 4000);
    } else if (httpOk && data.ok && data.status === 'posted') {
      setMsg({ kind: 'ok', text: 'Posted! ✓' });
      startTransition(() => router.refresh());
    } else if (httpOk && data.status === 'failed') {
      setMsg({ kind: 'err', text: `Publish failed: ${data.detail || 'unknown error'}` });
      startTransition(() => router.refresh());
    } else {
      setMsg({ kind: 'err', text: explain(data.error, data.detail) });
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
