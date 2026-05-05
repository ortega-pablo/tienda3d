'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AuthenticatedUser } from '@/lib/auth';

const UserContext = createContext<AuthenticatedUser | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: AuthenticatedUser;
  children: ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): AuthenticatedUser {
  const user = useContext(UserContext);
  if (!user) throw new Error('useCurrentUser must be used inside <UserProvider>');
  return user;
}

export function useHasPermission(): (key: string) => boolean {
  const user = useCurrentUser();
  return (key: string) => user.permissions.includes(key);
}
