import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
        <Inbox className="h-4 w-4 text-text-dim" />
      </div>
      <h3 className="text-sm font-medium text-text-base">{title}</h3>
      {description && (
        <p className="max-w-sm text-[13px] text-text-dim">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
