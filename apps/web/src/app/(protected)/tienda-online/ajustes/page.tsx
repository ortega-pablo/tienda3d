import type { EcommerceSettingsDto } from '@tienda3d/shared';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { SettingsForm } from './settings-form';

export default async function AjustesTiendaPage() {
  await requirePermission('ecommerce:settings');
  const settings = await api<EcommerceSettingsDto>('/web-catalog/settings');
  return <SettingsForm initial={settings} />;
}
