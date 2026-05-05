import 'server-only';
import { redirect } from 'next/navigation';
import { api, ApiError } from './api-server';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    return await api<AuthenticatedUser>('/auth/me');
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requirePermission(permission: string): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) redirect('/dashboard');
  return user;
}

export function hasPermission(user: AuthenticatedUser, key: string): boolean {
  return user.permissions.includes(key);
}
