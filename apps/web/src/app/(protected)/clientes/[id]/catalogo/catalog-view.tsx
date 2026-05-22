'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { formatMoney, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { TYPE_LABEL } from '../../types';

interface CatalogTier {
  minQty: number;
  maxQty: number | null;
  markupPct: number;
  finalPrice: number;
  profit: number;
}

interface CatalogProduct {
  productId: string;
  name: string;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  categoryName: string | null;
  channelName: string | null;
  tiers: CatalogTier[];
  basePrice: number | null;
  baseProfit: number | null;
}

export interface Catalog {
  customerId: string;
  customerName: string;
  customerType: 'STANDARD' | 'WHOLESALE' | 'CONSIGNMENT' | 'SPECIAL';
  channelName: string | null;
  generatedAt: string;
  products: CatalogProduct[];
}

/**
 * Vista del catálogo del cliente, con switch admin para mostrar/ocultar
 * markup % y ganancia. El switch es solo del lado staff — el cliente
 * nunca debe ver márgenes. El estado controla la visibilidad en pantalla
 * y propaga al link del PDF como `?showMargins=true|false`.
 */
export function CatalogView({ catalog }: { catalog: Catalog }) {
  const [showMargins, setShowMargins] = useState(false);

  const byCategory = new Map<string, CatalogProduct[]>();
  for (const p of catalog.products) {
    const key = p.categoryName ?? 'Sin categoría';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(p);
  }

  const pdfHref = `/api/customers/${catalog.customerId}/catalog.pdf?showMargins=${showMargins}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Catálogo · {catalog.customerName}</h1>
          <p className="text-muted-foreground">
            {TYPE_LABEL[catalog.customerType]}
            {catalog.channelName && ` · Precios para canal ${catalog.channelName}`}
            {' · Generado '}
            {new Date(catalog.generatedAt).toLocaleString('es-AR')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/clientes/${catalog.customerId}`}>Volver al cliente</Link>
          </Button>
          <Button asChild>
            <a href={pdfHref} target="_blank" rel="noopener">
              <Download className="h-4 w-4" />
              Descargar PDF{showMargins ? ' (interno)' : ''}
            </a>
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
          <Checkbox
            label="Mostrar markup y ganancia (vista admin)"
            checked={showMargins}
            onChange={(e) => setShowMargins(e.target.checked)}
          />
          {showMargins && (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              ⚠ Esta vista incluye margen interno. El PDF descargado con esta opción{' '}
              <strong>no se debe entregar al cliente</strong>.
            </p>
          )}
        </CardContent>
      </Card>

      {catalog.products.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Este catálogo está vacío. Asigná categorías o productos al cliente para que aparezcan
            acá.
          </CardContent>
        </Card>
      )}

      {[...byCategory.entries()].map(([category, products]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{category}</CardTitle>
            <CardDescription>
              {products.length} producto{products.length === 1 ? '' : 's'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {products.map((p) => (
              <ProductRow key={p.productId} product={p} showMargins={showMargins} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProductRow({
  product,
  showMargins,
}: {
  product: CatalogProduct;
  showMargins: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">{product.name}</div>
          {product.sku && (
            <div className="font-mono text-xs text-muted-foreground">SKU {product.sku}</div>
          )}
          {product.description && (
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{product.description}</p>
          )}
        </div>
      </div>

      {product.tiers.length === 0 && product.basePrice == null && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sin precio configurado para este canal.
        </p>
      )}

      {product.tiers.length === 0 && product.basePrice != null && (
        <div className="mt-2 flex items-baseline gap-2 text-sm">
          <span className="text-muted-foreground">Precio:</span>
          <span className="font-mono font-semibold">{formatMoney(product.basePrice)}</span>
        </div>
      )}

      {product.tiers.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-1 pr-4 font-medium">Cantidad</th>
              {showMargins && <th className="py-1 pr-4 font-medium">Markup</th>}
              <th className="py-1 pr-4 font-medium">Precio unit.</th>
              {showMargins && <th className="py-1 pr-4 font-medium">Ganancia</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {product.tiers.map((t) => (
              <tr key={`${t.minQty}-${t.maxQty}`}>
                <td className="py-1 pr-4">
                  {t.maxQty == null ? `${t.minQty}+` : `${t.minQty}–${t.maxQty}`}
                </td>
                {showMargins && (
                  <td className="py-1 pr-4 font-mono">{formatNumber(t.markupPct)}%</td>
                )}
                <td className="py-1 pr-4 font-mono font-semibold">
                  {formatMoney(t.finalPrice)}
                </td>
                {showMargins && (
                  <td className="py-1 pr-4 font-mono text-emerald-700 dark:text-emerald-300">
                    {formatMoney(t.profit)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
