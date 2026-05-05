import type { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'plastik_access';
export const REFRESH_COOKIE = 'plastik_refresh';

function baseOptions(maxAgeSeconds: number, secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  };
}

export function setAuthCookies(
  res: Response,
  tokens: {
    accessToken: string;
    accessExpiresIn: number;
    refreshToken: string;
    refreshExpiresIn: number;
  },
  isProduction: boolean,
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, baseOptions(tokens.accessExpiresIn, isProduction));
  res.cookie(
    REFRESH_COOKIE,
    tokens.refreshToken,
    baseOptions(tokens.refreshExpiresIn, isProduction),
  );
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}
