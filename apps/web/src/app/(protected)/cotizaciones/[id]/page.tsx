import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { QuoteActions, type QuoteDto } from './quote-actions';

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('quote:read');
  const { id } = await params;

  let quote: QuoteDto;
  try {
    quote = await api<QuoteDto>(`/quotes/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold font-mono">{quote.code}</h1>
            <StatusBadge status={quote.status} />
          </div>
          <p className="text-muted-foreground">
            {quote.customerName}
            {quote.channelName && ` · ${quote.channelName}`}
          </p>
        </div>
        <QuoteActions quote={quote} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalle</CardTitle>
            <CardDescription>{quote.itemCount} items.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Detalle</th>
                  <th className="py-2 pr-4 font-medium text-right">Cant.</th>
                  <th className="py-2 pr-4 font-medium text-right">Costo unit.</th>
                  <th className="py-2 pr-4 font-medium text-right">Precio unit.</th>
                  <th className="py-2 pr-4 font-medium text-right">Ganancia unit.</th>
                  <th className="py-2 pr-4 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quote.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{i.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.productId ? 'Producto del catálogo' : 'Pieza a medida'}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono">{i.quantity}</td>
                    <td className="py-3 pr-4 text-right font-mono text-muted-foreground">
                      {formatMoney(i.unitCost)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono">{formatMoney(i.unitPrice)}</td>
                    <td
                      className="py-3 pr-4 text-right font-mono text-emerald-700 dark:text-emerald-300"
                      title="Ganancia de bolsillo por unidad — snapshot al crear la cotización."
                    >
                      {formatMoney(i.unitProfit)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold">
                      {formatMoney(i.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t">
                <tr>
                  <td colSpan={4} className="py-2 pr-4 text-right text-sm text-muted-foreground">
                    Subtotal
                  </td>
                  <td
                    className="py-2 pr-4 text-right font-mono text-emerald-700 dark:text-emerald-300"
                    title="Ganancia de bolsillo total estimada (Σ unit_profit × cantidad)."
                  >
                    {formatMoney(
                      quote.items.reduce((acc, i) => acc + i.unitProfit * i.quantity, 0),
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono">{formatMoney(quote.subtotal)}</td>
                </tr>
                {quote.discount > 0 && (
                  <tr>
                    <td colSpan={5} className="py-2 pr-4 text-right text-sm text-muted-foreground">
                      Descuento
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">- {formatMoney(quote.discount)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={5} className="py-2 pr-4 text-right font-medium">
                    Total
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-lg font-bold">
                    {formatMoney(quote.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
            {quote.customerId && quote.customerProfileSnapshot && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <a
                  href={`/clientes/${quote.customerId}`}
                  className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                >
                  Ver cliente
                </a>
                {quote.customerProfileSnapshot.type && (
                  <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs">
                    {quote.customerProfileSnapshot.type === 'WHOLESALE'
                      ? 'Mayorista'
                      : quote.customerProfileSnapshot.type === 'CONSIGNMENT'
                        ? 'Consignación'
                        : quote.customerProfileSnapshot.type === 'SPECIAL'
                          ? 'Especial'
                          : 'Estándar'}
                  </span>
                )}
                {quote.customerProfileSnapshot.skipChannelCommission && (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    Sin comisión
                  </span>
                )}
                {quote.customerProfileSnapshot.skipMarketing && (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    Sin marketing
                  </span>
                )}
                {quote.customerProfileSnapshot.skipRegime && (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    Sin régimen
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Nombre" value={quote.customerName} />
            {quote.customerEmail && <Row label="Email" value={quote.customerEmail} />}
            {quote.customerPhone && <Row label="Teléfono" value={quote.customerPhone} />}
            {quote.channelName && <Row label="Canal" value={quote.channelName} />}
            <Row label="Factura" value={quote.withInvoice ? 'Sí' : 'No'} />
            {quote.validUntil && (
              <Row
                label="Válida hasta"
                value={new Date(quote.validUntil).toLocaleDateString('es-AR')}
              />
            )}
            <Row
              label="Creada"
              value={new Date(quote.createdAt).toLocaleDateString('es-AR')}
            />
            {!quote.customerId && (
              <p className="rounded-md border border-muted/40 bg-muted/20 p-2 text-xs text-muted-foreground">
                Cotización walk-in (sin cliente registrado).
              </p>
            )}
            {quote.notes && (
              <div className="border-t pt-2">
                <div className="text-xs text-muted-foreground">Notas</div>
                <p className="mt-1 text-sm">{quote.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
