import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { WebOrderDetailDto } from '@tienda3d/shared';
import { api, ApiError } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DELIVERY_LABEL,
  formatCents,
  FULFILLMENT_LABEL,
  METHOD_LABEL,
  PAYMENT_LABEL,
} from '../order-labels';
import { OrderActions } from './order-actions';
import { OrderNotes } from './order-notes';
import { ProductionButton } from './production-button';

export default async function PedidoWebPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('ecommerce:orders');
  const { id } = await params;

  let order: WebOrderDetailDto;
  try {
    order = await api<WebOrderDetailDto>(`/web-orders/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/tienda-online/pedidos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Pedidos web
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-3xl font-bold">{order.code}</h1>
            <Badge variant={PAYMENT_LABEL[order.paymentStatus].variant}>
              {PAYMENT_LABEL[order.paymentStatus].label}
            </Badge>
            <Badge variant={FULFILLMENT_LABEL[order.fulfillmentStatus].variant}>
              {FULFILLMENT_LABEL[order.fulfillmentStatus].label}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Pedido #{order.number} de la tienda · {formatDateTime(order.placedAt)}
          </p>
        </div>
        <OrderActions order={order} />
      </header>

      {order.cancelReason && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <span className="font-medium">Cancelado:</span> {order.cancelReason}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Productos</CardTitle>
              <CardDescription>
                Con los colores y las opciones que eligió el cliente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {order.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="font-medium">
                        <Link href={`/productos/${item.productId}`} className="hover:underline">
                          {item.productName}
                        </Link>
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {item.selections.map((s) => (
                          <li key={`${s.kind}-${s.label}`} className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">{s.label}:</span>
                            {s.colorHex && (
                              <span
                                aria-hidden
                                className="inline-block h-3.5 w-3.5 rounded-full border"
                                style={{ backgroundColor: s.colorHex }}
                              />
                            )}
                            <span>{s.value}</span>
                          </li>
                        ))}
                        {item.selections.length === 0 && (
                          <li className="text-muted-foreground">{item.variantLabel}</li>
                        )}
                      </ul>
                      {item.reservedQuantity > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {item.reservedQuantity === item.quantity
                            ? 'Sale del stock.'
                            : `${item.reservedQuantity} sale(n) del stock; el resto se fabrica.`}
                        </p>
                      )}
                      {item.productionOrderId && (
                        <p className="text-xs">
                          Orden de producción{' '}
                          <Link
                            href={`/produccion/${item.productionOrderId}`}
                            className="font-mono hover:underline"
                          >
                            {item.productionOrderCode}
                          </Link>
                        </p>
                      )}
                      {order.actions.production && !item.productionOrderId && (
                        <ProductionButton orderId={order.id} itemId={item.id} />
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-medium">{formatCents(item.lineTotalCents)}</p>
                      <p className="text-muted-foreground">
                        {item.quantity} × {formatCents(item.unitPriceCents)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <dl className="mt-2 space-y-1 border-t pt-3 text-sm">
                <Row label="Subtotal" value={formatCents(order.subtotalCents)} />
                <Row
                  label={order.shippingLabel}
                  value={
                    order.shippingCents == null
                      ? 'A coordinar'
                      : order.shippingCents === 0
                        ? 'Sin cargo'
                        : formatCents(order.shippingCents)
                  }
                />
                <Row label="Total" value={formatCents(order.totalCents)} strong />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {order.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-x-4">
                    <span>{e.message}</span>
                    <span className="text-muted-foreground">
                      {formatDateTime(e.createdAt)} · {e.actorName ?? 'Tienda'}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">
                <Link href={`/clientes/${order.customer.id}`} className="hover:underline">
                  {order.customer.name}
                </Link>
              </p>
              {order.customer.email && (
                <p>
                  <a href={`mailto:${order.customer.email}`} className="break-all hover:underline">
                    {order.customer.email}
                  </a>
                </p>
              )}
              {order.customer.phone && <p>{order.customer.phone}</p>}
              {order.customerNote && (
                <p className="mt-3 rounded-md bg-muted p-3">
                  <span className="block text-xs text-muted-foreground">Nota del cliente</span>
                  {order.customerNote}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Entrega y pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">{DELIVERY_LABEL[order.deliveryMethod]}</p>
                {order.shipping && (
                  <p className="text-muted-foreground">
                    {order.shipping.street} {order.shipping.number}
                    {order.shipping.apartment && `, ${order.shipping.apartment}`}
                    <br />
                    {order.shipping.city} ({order.shipping.province}) · CP{' '}
                    {order.shipping.postalCode}
                  </p>
                )}
                {order.trackingCode && (
                  <p>
                    Seguimiento: <span className="font-mono">{order.trackingCode}</span>
                  </p>
                )}
              </div>
              <div>
                <p className="font-medium">{METHOD_LABEL[order.paymentMethod]}</p>
                <p className="text-muted-foreground">
                  {order.paidAt
                    ? `Pagado el ${formatDateTime(order.paidAt)}`
                    : PAYMENT_LABEL[order.paymentStatus].label}
                </p>
              </div>
            </CardContent>
          </Card>

          <OrderNotes orderId={order.id} initial={order.internalNotes} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
