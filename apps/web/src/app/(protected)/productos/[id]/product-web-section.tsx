'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, Pencil, Store, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { SystemProductWebDto, WebProductDto } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { handleApiError } from '@/lib/handle-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { STATUS_LABEL } from '../../tienda-online/web-labels';

/**
 * La tienda desde la ficha del producto (plan F8·2): en qué publicación está,
 * el interruptor "Visible en la tienda" y el precio publicado. Si todavía no
 * se vende en la web, crea la publicación con este producto.
 */
export function ProductWebSection({
  productId,
  productName,
  productDescription,
  web,
  storeUrl,
  canWrite,
}: {
  productId: string;
  productName: string;
  productDescription: string | null;
  web: SystemProductWebDto;
  storeUrl: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { publication, checklist, price } = web;

  const act = async (action: () => Promise<WebProductDto>, success: string, go?: boolean) => {
    setBusy(true);
    try {
      const result = await action();
      toast.success(success);
      if (go) router.push(`/tienda-online/publicaciones/${result.id}`);
      else router.refresh();
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    act(
      () =>
        api<WebProductDto>('/web-catalog/products', {
          method: 'POST',
          body: {
            name: productName,
            ...(productDescription ? { description: productDescription } : {}),
            members: [{ productId, valueLabel: '' }],
          },
        }),
      'Publicación creada: completala con colores y fotos',
      true,
    );

  const published = publication?.status === 'PUBLISHED';
  const missing = checklist?.checks.filter((c) => !c.ok) ?? [];
  const priceLine =
    price.state === 'OK' && price.price != null ? (
      <span className="font-medium">{formatMoney(price.price)}</span>
    ) : (
      <span className="text-destructive">
        Sin precio{price.reason ? `: ${price.reason}` : ' calculado todavía'}
      </span>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="h-5 w-5" />
          Tienda online
        </CardTitle>
        <CardDescription>
          El precio en la web es el de Venta Directa a cliente normal, cantidad 1.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">Precio publicado: {priceLine}</p>

        {!publication ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4">
            <p className="text-sm text-muted-foreground">
              Este producto todavía no se vende en la tienda.
            </p>
            {canWrite && (
              <Button onClick={create} disabled={busy}>
                Crear publicación con este producto
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{publication.name}</span>
                <Badge variant={STATUS_LABEL[publication.status].variant}>
                  {STATUS_LABEL[publication.status].label}
                </Badge>
              </div>
              <Switch
                checked={published}
                disabled={!canWrite || busy || (!published && !checklist?.ready)}
                onCheckedChange={(visible) =>
                  act(
                    () =>
                      api<WebProductDto>(
                        `/web-catalog/products/${publication.id}/${visible ? 'publish' : 'hide'}`,
                        { method: 'POST' },
                      ),
                    visible ? 'Visible en la tienda' : 'Oculta en la tienda',
                  )
                }
                label="Visible en la tienda"
              />
            </div>
            {!published && missing.length > 0 && (
              <ul className="space-y-1 text-sm">
                <li className="text-muted-foreground">Para hacerla visible falta:</li>
                {missing.map((c) => (
                  <li key={c.key} className="flex items-start gap-2">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span>
                      {c.label}
                      {c.detail && <span className="block text-muted-foreground">{c.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/tienda-online/publicaciones/${publication.id}`}>
                  <Pencil className="h-4 w-4" />
                  {missing.length ? 'Completar publicación' : 'Editar publicación'}
                </Link>
              </Button>
              {published && (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`${storeUrl}/producto/${publication.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver en la tienda
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
