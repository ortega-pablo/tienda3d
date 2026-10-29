import Link from 'next/link';
import { webOrderListQuerySchema, type WebOrderSummaryDto } from '@tienda3d/shared';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderFilters } from './order-filters';
import {
  DELIVERY_LABEL,
  formatCents,
  FULFILLMENT_LABEL,
  METHOD_LABEL,
  PAYMENT_LABEL,
} from './order-labels';

export default async function PedidosWebPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('ecommerce:orders');
  // Un filtro inválido en la URL se ignora en vez de romper la página.
  const parsed = webOrderListQuerySchema.safeParse(await searchParams);
  const filters = parsed.success ? parsed.data : {};
  const query = new URLSearchParams(
    Object.entries(filters).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  const orders = await api<WebOrderSummaryDto[]>(`/web-orders${query ? `?${query}` : ''}`);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Pedidos web</h1>
        <p className="text-muted-foreground">
          Lo que entra por la tienda. Confirmá las transferencias al ver el comprobante y mové cada
          pedido a medida que se prepara.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>{orders.length} pedidos</CardTitle>
              <CardDescription>Del más nuevo al más viejo.</CardDescription>
            </div>
            <OrderFilters filters={filters} />
          </div>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {filtered
                ? 'Ningún pedido coincide con el filtro.'
                : 'Todavía no entró ningún pedido por la tienda.'}
            </p>
          ) : (
            <ul className="divide-y">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/tienda-online/pedidos/${o.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md px-2 py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-medium">{o.code}</span>
                        <span className="text-sm text-muted-foreground">#{o.number}</span>
                        {o.needsAttention && <Badge variant="warning">Para atender</Badge>}
                      </span>
                      <span className="block truncate text-sm">
                        {o.customerName}
                        {o.customerEmail && (
                          <span className="text-muted-foreground"> · {o.customerEmail}</span>
                        )}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        <Badge variant={PAYMENT_LABEL[o.paymentStatus].variant}>
                          {PAYMENT_LABEL[o.paymentStatus].label}
                        </Badge>
                        <Badge variant={FULFILLMENT_LABEL[o.fulfillmentStatus].variant}>
                          {FULFILLMENT_LABEL[o.fulfillmentStatus].label}
                        </Badge>
                      </span>
                    </span>
                    <span className="text-right text-sm">
                      <span className="block font-medium">{formatCents(o.totalCents)}</span>
                      <span className="block text-muted-foreground">
                        {METHOD_LABEL[o.paymentMethod]} · {DELIVERY_LABEL[o.deliveryMethod]}
                      </span>
                      <span className="block text-muted-foreground">
                        {formatDateTime(o.placedAt)} · {o.units} u.
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
