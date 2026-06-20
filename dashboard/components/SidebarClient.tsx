'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export function SidebarClient() {
  const pathname = usePathname() || '/';
  if (pathname.startsWith('/login')) return null;
  return <Sidebar currentPath={pathname} />;
}

export default SidebarClient;
