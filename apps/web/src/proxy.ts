import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ACCESS_COOKIE = 'plastik_access';
const PROTECTED_PREFIX = [
  '/dashboard',
  '/admin',
  '/parametros',
  '/equipos',
  '/proveedores',
  '/insumos',
  '/productos',
  '/canales',
  '/cotizaciones',
  '/produccion',
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requiresAuth = PROTECTED_PREFIX.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!requiresAuth) return NextResponse.next();

  const hasToken = req.cookies.has(ACCESS_COOKIE);
  if (hasToken) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
