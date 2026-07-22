import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Pages that don't need a session.
//
// /bootstrap MUST be here: it is the recovery route for being locked out, so by
// definition its user has no session. Guarding it would redirect them to the
// /login they cannot get past. The page defends itself instead — it 404s unless
// KARST_BOOTSTRAP_TOKEN is set, and requires that token to do anything.
const PUBLIC_PAGES = ['/login', '/forgot', '/reset', '/bootstrap'];

function isPublicPage(pathname: string): boolean {
  for (const p of PUBLIC_PAGES) {
    if (pathname === p) return true;
    if (pathname.startsWith(p + '/')) return true;
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Matcher already excludes /api, /_next, static assets — so anything that
  // reaches us is a page route.
  if (isPublicPage(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('karst_session');
  if (!sessionCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', pathname + (search || ''));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Exclude every API route from middleware — route handlers do their own
// auth (public ones via withCors, admin ones via getSession() + 401 JSON).
// Also exclude framework asset prefixes.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|_next/data|favicon.ico|robots.txt|og-image.svg).*)',
  ],
};
