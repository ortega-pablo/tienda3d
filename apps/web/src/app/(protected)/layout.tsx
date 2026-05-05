import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';
import { UserProvider } from '@/components/user-provider';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <UserProvider user={user}>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}
