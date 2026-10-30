import type { EcommercePaymentsDto, EcommerceSettingsDto } from '@tienda3d/shared';
import { api } from '@/lib/api-server';
import { hasPermission, requirePermission } from '@/lib/auth';
import { PaymentsForm } from './payments-form';
import { SettingsForm } from './settings-form';

export default async function AjustesTiendaPage() {
  const user = await requirePermission('ecommerce:settings');
  // Los medios de pago piden su propio permiso (F22·2).
  const canPayments = hasPermission(user, 'ecommerce:payments');
  const [settings, payments] = await Promise.all([
    api<EcommerceSettingsDto>('/web-catalog/settings'),
    canPayments ? api<EcommercePaymentsDto>('/web-catalog/settings/payments') : null,
  ]);
  return (
    <div className="space-y-10">
      <SettingsForm initial={settings} />
      {payments && <PaymentsForm initial={payments} />}
    </div>
  );
}
