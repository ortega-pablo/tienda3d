import type { ReactNode } from 'react';
import type { WebOrderAttentionDto, WebQuoteRequestCountDto } from '@tienda3d/shared';
import { api } from '@/lib/api-server';
import { requireUser } from '@/lib/auth';
import { AppShell, type NavBadges } from '@/components/app-shell';
import { UserProvider } from '@/components/user-provider';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const badges: NavBadges = {};
  if (user.permissions.includes('ecommerce:orders')) {
    // Pedidos web que esperan al taller y solicitudes nuevas. Si la API no
    // responde, el menú sigue sin los contadores.
    const [attention, requests] = await Promise.all([
      api<WebOrderAttentionDto>('/web-orders/attention').catch(() => null),
      api<WebQuoteRequestCountDto>('/web-quote-requests/new-count').catch(() => null),
    ]);
    if (attention) badges['/tienda-online/pedidos'] = attention.count;
    if (requests) badges['/tienda-online/solicitudes'] = requests.count;
  }
  if (user.permissions.includes('quote:read')) {
    // Pedidos B2B de la tienda que esperan respuesta (F21·3).
    const pending = await api<{ count: number }>('/quotes/store-pending/count').catch(() => null);
    if (pending) badges['/cotizaciones'] = pending.count;
  }
  return (
    <UserProvider user={user}>
      <AppShell badges={badges}>{children}</AppShell>
    </UserProvider>
  );
}
