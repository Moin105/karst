import clsx from 'clsx';
import Card from './ui/Card';

export interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: string;
  hint?: string;
  accent?: boolean;
}

function parseDeltaTone(delta?: string): 'up' | 'down' | 'neutral' {
  if (!delta) return 'neutral';
  const t = delta.trim();
  if (t.startsWith('+')) return 'up';
  if (t.startsWith('-')) return 'down';
  return 'neutral';
}

export function KpiCard({ label, value, delta, hint, accent }: KpiCardProps) {
  const tone = parseDeltaTone(delta);
  return (
    <Card className="flex flex-col gap-2">
      <div className="text-text-dim text-xs uppercase tracking-widest">
        {label}
      </div>
      <div
        className={clsx(
          'text-3xl font-bold font-mono tabular-nums',
          accent ? 'text-accent-2' : 'text-text-base'
        )}
      >
        {value}
      </div>
      <div className="flex items-center gap-2">
        {delta && (
          <span
            className={clsx(
              'text-xs font-medium',
              tone === 'up' && 'text-accent-2',
              tone === 'down' && 'text-red-400',
              tone === 'neutral' && 'text-text-dim'
            )}
          >
            {delta}
          </span>
        )}
        {hint && <span className="text-text-dim text-sm">{hint}</span>}
      </div>
    </Card>
  );
}

export default KpiCard;
