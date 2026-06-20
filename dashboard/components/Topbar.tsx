import { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import Button from './ui/Button';

export interface TopbarProps {
  title: string;
  actions?: ReactNode;
}

export function Topbar({ title, actions }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 h-14 px-6 flex items-center justify-between bg-bg/80 backdrop-blur border-b border-border">
      <h1 className="text-[18px] font-semibold tracking-tight text-text-base">
        {title}
      </h1>
      <div className="flex items-center gap-3">
        {actions ?? (
          <form action="/api/auth/logout" method="POST">
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </form>
        )}
      </div>
    </header>
  );
}

export default Topbar;
