import { requirePermission } from '@/lib/auth';

/** Toda la gestión de la tienda online es del rol admin (permisos ecommerce:*). */
export default async function TiendaOnlineLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('ecommerce:read');
  return children;
}
