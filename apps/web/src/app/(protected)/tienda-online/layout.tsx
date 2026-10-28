import { requirePermission } from '@/lib/auth';
import { OutboxAlert } from './outbox-alert';

/** Toda la gestión de la tienda online es del rol admin (permisos ecommerce:*). */
export default async function TiendaOnlineLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('ecommerce:read');
  return (
    <div className="space-y-6">
      <OutboxAlert />
      {children}
    </div>
  );
}
