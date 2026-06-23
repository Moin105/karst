import clsx from 'clsx';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Download,
  MessageSquare,
  Megaphone,
  BarChart3,
  Building2,
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
  { label: 'Downloads', href: '/installs', icon: Download },
  { label: 'Signups', href: '/signups', icon: Users },
  { label: 'Feedback', href: '/feedback', icon: MessageSquare },
  { label: 'Social', href: '/social', icon: Megaphone },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Enterprise', href: '/enterprise', icon: Building2 },
  { label: 'Settings', href: '/settings', icon: Settings },
];

function isActive(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(href + '/');
}

export function Sidebar({ currentPath }: SidebarProps) {
  return (
    <aside className="w-60 bg-surface border-r border-border h-screen sticky top-0 flex flex-col">
      <div className="px-4 py-4 flex items-center gap-2.5">
        <Logo size={26} />
        <span className="text-text-base font-semibold tracking-tight text-[15px]">
          karst
        </span>
      </div>

      <nav className="flex-1 px-3 py-2 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = isActive(currentPath, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'relative h-9 px-3 rounded-lg flex items-center gap-3 text-[13px] transition-colors',
                active
                  ? 'text-text-base bg-white/5'
                  : 'text-text-dim hover:text-text-base hover:bg-white/5'
              )}
            >
              {active && (
                <span className="absolute left-0 inset-y-1 w-0.5 bg-accent rounded-full" />
              )}
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-4 py-3 border-t border-border">
        <span className="text-[11px] text-text-dim tabular">v0.1.0</span>
      </div>
    </aside>
  );
}

export default Sidebar;
