import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-text-dim">
      <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mb-4">
        <Inbox className="w-5 h-5 text-text-dim" />
      </div>
      <h3 className="text-text-base font-medium text-base mb-1">{title}</h3>
      <p className="text-sm max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
