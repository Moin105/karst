'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

// Auth screens render standalone (no dashboard chrome).
const AUTH_PREFIXES = ['/login', '/forgot', '/reset'];

export function SidebarClient() {
  const pathname = usePathname() || '/';
  if (AUTH_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <Sidebar currentPath={pathname} />;
}

export default SidebarClient;
