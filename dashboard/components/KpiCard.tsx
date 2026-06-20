import clsx from 'clsx';
import Card from './ui/Card';

export interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: string;
  hint?: string;
  accent?: boolean;
}

export function KpiCard({ label, value, delta, hint, accent }: KpiCardProps) {
  const deltaDown = !!delta && delta.trim().startsWith('-');
  return (
    <Card className="flex flex-col gap-2 min-h-[112px] p-5">
      <div className="text-[11px] uppercase tracking-wide text-text-dim">
        {label}
      </div>
      <div
        className={clsx(
          'text-[28px] leading-none font-bold tabular',
          accent ? 'text-accent-2' : 'text-text-base'
        )}
      >
        {value}
      </div>
      {delta && (
        <div
          className={clsx(
            'text-xs',
            deltaDown ? 'text-red-400' : 'text-accent-2'
          )}
        >
          {delta}
        </div>
      )}
      {hint && <div className="text-xs text-text-dim mt-auto">{hint}</div>}
    </Card>
  );
}

export default KpiCard;
