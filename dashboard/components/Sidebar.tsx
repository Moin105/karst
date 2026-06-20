import clsx from 'clsx';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Download,
  MessageSquare,
  BarChart3,
  FileText,
  Settings,
} from 'lucide-react';
import Logo from './Logo';

export interface SidebarProps {
  currentPath: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: 'Overview', href: '/', icon: LayoutDashboard },
  { label: 'Signups', href: '/signups', icon: Users },
  { label: 'Design Partners', href: '/partners', icon: Briefcase },
  { label: 'Installs', href: '/installs', icon: Download },
  { label: 'Feedback', href: '/feedback', icon: MessageSquare },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Content', href: '/content', icon: FileText },
  { label: 'Settings', href: '/settings', icon: Settings },
];

function isActive(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(href + '/');
}

export function Sidebar({ currentPath }: SidebarProps) {
  return (
    <aside className="w-64 bg-surface border-r border-border h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-5 flex items-center gap-2.5 border-b border-border">
        <Logo size={28} />
        <span className="text-text-base font-semibold tracking-tight text-lg">
          karst
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = isActive(currentPath, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-bg text-accent border-l-2 border-accent'
                  : 'text-text-dim hover:text-text-base hover:bg-bg/40'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-border">
        <span className="text-text-dim text-xs font-mono">v0.1.0</span>
      </div>
    </aside>
  );
}

export default Sidebar;
