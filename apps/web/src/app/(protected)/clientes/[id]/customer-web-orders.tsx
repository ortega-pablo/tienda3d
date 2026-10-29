'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { WebOrderSummaryDto } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  formatCents,
  FULFILLMENT_LABEL,
  PAYMENT_LABEL,
} from '../../tienda-online/pedidos/order-labels';

/**
 * Lo que compró el cliente por la tienda online (F14·8). El precio de esos
 * pedidos es el publicado, no el de su tipo de cliente (D4).
 */
export function CustomerWebOrders({ customerId }: { customerId: string }) {
  const [orders, setOrders] = useState<WebOrderSummaryDto[] | null>(null);

  useEffect(() => {
    api<WebOrderSummaryDto[]>(`/web-orders?customer=${encodeURIComponent(customerId)}`)
      .then(setOrders)
      .catch((err) => handleApiError(err));
  }, [customerId]);

  if (!orders) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" /> Cargando…
      </p>
    );
  }
  if (orders.length === 0) {
    return <p className="text-sm text-muted-foreground">No compró por la tienda online.</p>;
  }
  const paid = orders.filter(
    (o) => o.paymentStatus === 'APPROVED' && o.fulfillmentStatus !== 'CANCELLED',
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {orders.length} pedido(s) · {paid.length} pagado(s) por{' '}
        {formatCents(paid.reduce((n, o) => n + o.totalCents, 0))}. Precio publicado de la tienda.
      </p>
      <ul className="divide-y">
        {orders.map((o) => (
          <li key={o.id}>
            <Link
              href={`/tienda-online/pedidos/${o.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
            >
              <span className="font-mono font-medium">{o.code}</span>
              <span className="text-muted-foreground">#{o.number}</span>
              <span className="text-muted-foreground">{formatDate(o.placedAt)}</span>
              <span className="flex flex-1 flex-wrap gap-1.5">
                <Badge variant={PAYMENT_LABEL[o.paymentStatus].variant}>
                  {PAYMENT_LABEL[o.paymentStatus].label}
                </Badge>
                <Badge variant={FULFILLMENT_LABEL[o.fulfillmentStatus].variant}>
                  {FULFILLMENT_LABEL[o.fulfillmentStatus].label}
                </Badge>
              </span>
              <span className="font-medium">{formatCents(o.totalCents)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
