import type { ReactNode } from 'react';
import type { WebOrderAttentionDto } from '@tienda3d/shared';
import { api } from '@/lib/api-server';
import { requireUser } from '@/lib/auth';
import { AppShell, type NavBadges } from '@/components/app-shell';
import { UserProvider } from '@/components/user-provider';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const badges: NavBadges = {};
  if (user.permissions.includes('ecommerce:orders')) {
    // Pedidos web que esperan al taller. Si la API no responde, el menú sigue sin el contador.
    const attention = await api<WebOrderAttentionDto>('/web-orders/attention').catch(() => null);
    if (attention) badges['/tienda-online/pedidos'] = attention.count;
  }
  return (
    <UserProvider user={user}>
      <AppShell badges={badges}>{children}</AppShell>
    </UserProvider>
  );
}
