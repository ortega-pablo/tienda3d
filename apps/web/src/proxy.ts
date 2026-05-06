import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ACCESS_COOKIE = 'plastik_access';
const REFRESH_COOKIE = 'plastik_refresh';
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://api:3001';
/** Refresh proactively when less than this many seconds are left on the access. */
const REFRESH_THRESHOLD_SECONDS = 60;

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

function redirectToLogin(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

/** Read the `exp` claim without validating signature — just to decide whether to refresh. */
function readExp(jwt: string): number | null {
  try {
    const [, payload] = jwt.split('.');
    if (!payload) return null;
    // Edge runtime: atob is global; pad base64url for atob compatibility.
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      '=',
    );
    const json = atob(padded);
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === 'number' ? parsed.exp : null;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requiresAuth = PROTECTED_PREFIX.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!requiresAuth) return NextResponse.next();

  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;

  if (!access && !refresh) return redirectToLogin(req, pathname);

  const now = Math.floor(Date.now() / 1000);
  const exp = access ? readExp(access) : null;
  const accessExpiredOrNear = !access || !exp || exp - now < REFRESH_THRESHOLD_SECONDS;

  if (accessExpiredOrNear && refresh) {
    try {
      const apiRes = await fetch(`${API_INTERNAL_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { cookie: `${REFRESH_COOKIE}=${refresh}` },
      });
      if (apiRes.ok) {
        const res = NextResponse.next();
        for (const cookie of apiRes.headers.getSetCookie()) {
          res.headers.append('set-cookie', cookie);
        }
        return res;
      }
    } catch {
      // Network or API down — fall through to login redirect below.
    }
    return redirectToLogin(req, pathname);
  }

  // Access still valid (or no refresh available — let render fail then proxy will redirect).
  if (!access) return redirectToLogin(req, pathname);
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
