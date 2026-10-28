'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle2, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { WebPriceDto, WebProductDto, WebPublishChecklistDto } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/format';
import { handleApiError } from '@/lib/handle-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TabProps } from './publication-editor';

const money = (value: number | null) => (value == null ? 'sin precio' : formatMoney(value));

export function PublicationTab({
  product,
  run,
  canWrite,
  checklist,
  prices,
  storeUrl,
}: TabProps & {
  checklist: WebPublishChecklistDto;
  prices: WebPriceDto[];
  storeUrl: string;
}) {
  const router = useRouter();
  const published = product.status === 'PUBLISHED';
  const nameOf = (productId: string) =>
    product.members.find((m) => m.productId === productId)?.productName ?? productId;

  const toggle = () =>
    run(
      () =>
        api<WebProductDto>(
          `/web-catalog/products/${product.id}/${published ? 'hide' : 'publish'}`,
          { method: 'POST' },
        ),
      published ? 'La publicación quedó oculta' : 'La publicación está visible en la tienda',
    );

  const recompute = async () => {
    try {
      const r = await api<{ checked: number; changed: number }>('/web-catalog/prices/recompute', {
        method: 'POST',
      });
      toast.success(`Precios recalculados: ${r.changed} de ${r.checked} cambiaron`);
      router.refresh();
    } catch (err) {
      handleApiError(err);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Antes de publicar</CardTitle>
          <CardDescription>
            {published
              ? 'Está visible en la tienda.'
              : product.status === 'HIDDEN'
                ? 'Está oculta: no se ve en la tienda.'
                : 'Es un borrador: todavía no se publicó.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {checklist.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <span>
                  {c.label}
                  {!c.ok && c.detail && (
                    <span className="block text-muted-foreground">{c.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {canWrite && (
              <Button
                variant={published ? 'outline' : 'default'}
                disabled={!published && !checklist.ready}
                onClick={toggle}
              >
                {published ? 'Ocultar de la tienda' : 'Publicar en la tienda'}
              </Button>
            )}
            {published && (
              <Button asChild variant="outline">
                <a href={`${storeUrl}/producto/${product.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Ver en la tienda
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Precios</CardTitle>
              <CardDescription>
                Venta Directa a cliente normal, cantidad 1. Se recalculan solos cuando cambia un
                costo o un markup.
              </CardDescription>
            </div>
            {canWrite && (
              <Button variant="outline" size="sm" onClick={recompute}>
                <RefreshCw className="h-4 w-4" />
                Recalcular precios
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {prices.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin productos del sistema todavía.</p>
          )}
          {prices.map((p) => (
            <section key={p.productId} className="space-y-2">
              <h3 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
                {nameOf(p.productId)}
                <span className={p.state === 'OK' ? '' : 'text-destructive'}>{money(p.price)}</span>
              </h3>
              {p.reason && <p className="text-sm text-destructive">{p.reason}</p>}
              {p.history.length > 0 && (
                <ol className="space-y-1 text-xs text-muted-foreground">
                  {p.history.slice(0, 5).map((h, i) => (
                    <li key={`${h.changedAt}-${i}`} className="flex flex-wrap gap-x-2">
                      <span>{formatDateTime(h.changedAt)}</span>
                      <span>
                        {h.previous == null ? 'alta' : money(h.previous)} → {money(h.price)}
                      </span>
                      <span className="text-foreground">{h.cause}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
