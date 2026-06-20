import { ReactNode } from 'react';
import { LogOut } from 'lucide-react';

export interface TopbarProps {
  title: string;
  actions?: ReactNode;
}

export function Topbar({ title, actions }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 h-14 bg-bg/80 backdrop-blur border-b border-border flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-text-base">{title}</h1>
      <div className="flex items-center gap-3">
        {actions ?? (
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="inline-flex items-center gap-2 text-sm text-text-dim hover:text-text-base transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </form>
        )}
      </div>
    </header>
  );
}

export default Topbar;
