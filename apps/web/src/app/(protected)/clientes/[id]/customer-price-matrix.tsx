'use client';

import { useEffect, useMemo, useState } from 'react';
import { Coins, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { formatMoney, formatNumber } from '@/lib/format';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import type { CustomerWithRelations, ProductSummaryDto } from '../types';

interface PriceLine {
  markupPct: number;
  commissionPct: number;
  taxBurdenPct: number;
  finalPrice: number;
  profit: number;
  missingCommission: boolean;
}

interface ChannelTierLine {
  tierId: string | null;
  minQty: number;
  maxQty: number | null;
  line: PriceLine;
}

interface ChannelBlock {
  channelId: string;
  channelName: string;
  channelKind: string;
  base: PriceLine | null;
  tiers: ChannelTierLine[];
  needsConfig: boolean;
}

interface PricesResponse {
  fabricationPrice: number;
  totalCost: number;
  profitPerUnit: number;
  targetMarkupPct: number;
  channels: ChannelBlock[];
}

export function CustomerPriceMatrix({
  customer,
  products,
}: {
  customer: CustomerWithRelations;
  products: ProductSummaryDto[];
}) {
  const eligibleProducts = useMemo(() => {
    if (customer.type === 'SPECIAL') {
      const ids = new Set(customer.productOverrides.map((p) => p.productId));
      return products.filter((p) => ids.has(p.id));
    }
    if (customer.type === 'WHOLESALE') {
      const ids = new Set<string>();
      const parents = new Set<string>();
      for (const cc of customer.categoryCommitments) {
        if (cc.categoryParentId == null) parents.add(cc.categoryId);
        else ids.add(cc.categoryId);
      }
      return products.filter((p) => {
        if (!p.categoryId) return false;
        if (ids.has(p.categoryId)) return true;
        // si es subcategoría hija de un padre asociado
        // (no tenemos el árbol acá, pero el backend filtra; mostramos los que tienen categoría)
        return parents.size > 0;
      });
    }
    return products.filter((p) => p.isActive);
  }, [customer, products]);

  const [productId, setProductId] = useState<string>('');
  const [prices, setPrices] = useState<PricesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (eligibleProducts.length > 0 && !productId) setProductId(eligibleProducts[0]!.id);
  }, [eligibleProducts, productId]);

  useEffect(() => {
    if (!productId) {
      setPrices(null);
      return;
    }
    setLoading(true);
    api<PricesResponse>(`/customers/${customer.id}/products/${productId}/prices`)
      .then(setPrices)
      .catch((err) => {
        handleApiError(err, { fallback: 'No se pudo calcular precios para este cliente.' });
        setPrices(null);
      })
      .finally(() => setLoading(false));
  }, [customer.id, productId]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Precios para este cliente</CardTitle>
            <CardDescription>
              Aplica todos los flags y overrides al motor. Útil antes de armar una cotización.
            </CardDescription>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Producto</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="flex h-9 w-72 rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              {eligibleProducts.length === 0 && (
                <option value="">Sin productos elegibles</option>
              )}
              {eligibleProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" /> Calculando…
          </p>
        )}
        {!loading && eligibleProducts.length === 0 && (
          <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            {customer.type === 'WHOLESALE'
              ? 'Asociá al menos una categoría para que el cliente pueda comprar productos.'
              : customer.type === 'SPECIAL'
                ? 'Asignále al menos un producto para que pueda comprar.'
                : 'No hay productos disponibles.'}
          </p>
        )}
        {!loading && prices && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-4 text-sm">
              <span>
                <span className="text-muted-foreground">Fabricación:</span>{' '}
                <span className="font-mono">{formatMoney(prices.fabricationPrice)}</span>
              </span>
              <span>
                <span className="text-muted-foreground">Costo total:</span>{' '}
                <span className="font-mono">{formatMoney(prices.totalCost)}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
                <Coins className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Ganancia base:
                </span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatMoney(prices.profitPerUnit)}
                </span>
                <span className="text-xs text-muted-foreground">
                  (markup {formatNumber(prices.targetMarkupPct)}%)
                </span>
              </span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Canal</th>
                  <th className="py-2 pr-4 font-medium">Escala</th>
                  <th className="py-2 pr-4 font-medium">Markup</th>
                  <th className="py-2 pr-4 font-medium">Comisión</th>
                  <th className="py-2 pr-4 font-medium">Régimen</th>
                  <th className="py-2 pr-4 font-medium">Precio</th>
                  <th className="py-2 pr-4 font-medium">Ganancia</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {prices.channels.flatMap((c) => {
                  const rows: React.ReactElement[] = [];
                  if (c.base) {
                    rows.push(
                      <PriceRow key={`${c.channelId}-base`} channel={c.channelName} tierLabel="Base" line={c.base} />,
                    );
                  }
                  for (const t of c.tiers) {
                    const range = t.maxQty == null ? `${t.minQty}+` : `${t.minQty}-${t.maxQty}`;
                    rows.push(
                      <PriceRow
                        key={`${c.channelId}-${t.tierId}`}
                        channel={c.channelName}
                        tierLabel={range}
                        line={t.line}
                      />,
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PriceRow({
  channel,
  tierLabel,
  line,
}: {
  channel: string;
  tierLabel: string;
  line: PriceLine;
}) {
  return (
    <tr>
      <td className="py-2 pr-4 font-medium">{channel}</td>
      <td className="py-2 pr-4 text-xs">{tierLabel}</td>
      <td className="py-2 pr-4 font-mono">{formatNumber(line.markupPct)}%</td>
      <td className="py-2 pr-4 font-mono">{formatNumber(line.commissionPct)}%</td>
      <td className="py-2 pr-4 font-mono text-muted-foreground">
        {formatNumber(line.taxBurdenPct)}%
      </td>
      <td className="py-2 pr-4 font-mono font-semibold">{formatMoney(line.finalPrice)}</td>
      <td className="py-2 pr-4 font-mono font-semibold text-emerald-700 dark:text-emerald-300">
        {formatMoney(line.profit)}
      </td>
    </tr>
  );
}

// Para evitar warnings.
void Eye;
void EyeOff;
