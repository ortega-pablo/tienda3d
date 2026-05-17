'use client';

import { ExternalLink } from 'lucide-react';
import { formatMoney, formatNumber } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ChannelKind = 'DIRECT_SALE' | 'CASH' | 'MARKETPLACE' | 'CUSTOM';

interface PriceLine {
  markupPct: number;
  commissionPct: number;
  taxBurdenPct: number;
  denominator: number;
  netPrice: number;
  finalPrice: number;
  profit: number;
  effectiveMarginPct: number;
  missingCommission: boolean;
  warnings: string[];
}

interface ChannelTierPrice {
  tierId: string | null;
  minQty: number;
  maxQty: number | null;
  line: PriceLine;
}

interface ChannelPriceBlock {
  channelId: string;
  channelName: string;
  channelSlug: string;
  channelKind: ChannelKind;
  icon: string | null;
  taxMode: 'SIMPLE' | 'DETAILED';
  withInvoiceDefault: boolean;
  enabled: boolean;
  needsConfig: boolean;
  productCommissionPct: number | null;
  base: PriceLine | null;
  tiers: ChannelTierPrice[];
}

export interface ProductPricesResponse {
  productId: string;
  productName: string;
  /** Logic C v3 — base del profit. */
  fabricationPrice?: number;
  otherMaterialsWithReplenishment?: number;
  totalCost?: number;
  /** Legacy alias (= totalCost). */
  costWithProvisions: number;
  /** Profit por unidad usando el baseMarkupPct de la categoría. Es referencial. */
  profitPerUnit: number;
  /** baseMarkupPct efectivo de la categoría del producto. */
  targetMarkupPct: number;
  channels: ChannelPriceBlock[];
}

export interface ChannelLite {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  kind: ChannelKind;
  isActive: boolean;
  isSystem: boolean;
  commissionPct: number;
}

/**
 * Matriz de precios por canal y tier. Las escalas se editan en
 * `/categorias/:id` (vienen de la categoría del producto con herencia
 * subcategoría → padre). Acá solo se visualiza.
 */
export function ProductPrices({
  prices,
  categoryId,
}: {
  prices: ProductPricesResponse | null;
  categoryId: string;
}) {
  if (!prices) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Precios por canal</CardTitle>
          <CardDescription>
            No se pudo calcular. Revisá filamentos y precios.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle>Precios por canal</CardTitle>
            <CardDescription>
              Costo total: {formatMoney(prices.totalCost ?? prices.costWithProvisions)}
              {prices.fabricationPrice != null && (
                <> · Fabricación: {formatMoney(prices.fabricationPrice)}</>
              )}{' '}
              · Markup base de la categoría: {formatNumber(prices.targetMarkupPct)}%
            </CardDescription>
            <p className="text-xs text-muted-foreground">
              Las escalas y el markup base vienen de la categoría del producto.{' '}
              <a
                href={`/categorias/${categoryId}`}
                className="inline-flex items-center gap-1 underline"
              >
                Editar escalas de la categoría
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {prices.channels.length === 0 ? (
          <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            Este producto no tiene canales habilitados. Activá al menos uno desde el editor.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Canal</th>
                <th className="py-2 pr-4 font-medium">Escala</th>
                <th className="py-2 pr-4 font-medium">Markup</th>
                <th className="py-2 pr-4 font-medium">Comisión</th>
                <th className="py-2 pr-4 font-medium">Régimen</th>
                <th className="py-2 pr-4 font-medium">Precio</th>
                <th className="py-2 pr-4 font-medium">Ganancia / unidad</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {prices.channels.flatMap((c): React.ReactElement[] => {
                if (c.needsConfig) {
                  return [
                    <tr key={`${c.channelId}-needs`} className="bg-destructive/5">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1">
                          {c.icon && <span>{c.icon}</span>}
                          <span className="font-medium">{c.channelName}</span>
                        </div>
                      </td>
                      <td colSpan={6} className="py-2 pr-4 text-xs text-destructive">
                        ⚠{' '}
                        {c.channelKind === 'MARKETPLACE'
                          ? 'Cargá la comisión MELI para este producto desde el editor.'
                          : 'Falta configurar este canal.'}
                      </td>
                    </tr>,
                  ];
                }
                const rows: React.ReactElement[] = [];
                if (c.base) {
                  rows.push(
                    <PriceRow
                      key={`${c.channelId}-base`}
                      channel={c}
                      line={c.base}
                      tierLabel="Base"
                    />,
                  );
                }
                for (const t of c.tiers) {
                  const range = t.maxQty == null ? `${t.minQty}+` : `${t.minQty}-${t.maxQty}`;
                  rows.push(
                    <PriceRow
                      key={`${c.channelId}-${t.tierId}`}
                      channel={c}
                      line={t.line}
                      tierLabel={range}
                    />,
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function PriceRow({
  channel,
  line,
  tierLabel,
}: {
  channel: ChannelPriceBlock;
  line: PriceLine;
  tierLabel: string;
}) {
  return (
    <tr>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-1">
          {channel.icon && <span>{channel.icon}</span>}
          <span className="font-medium">{channel.channelName}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {channel.channelKind.toLowerCase().replace('_', ' ')}
        </div>
      </td>
      <td className="py-2 pr-4 text-xs">{tierLabel}</td>
      <td className="py-2 pr-4 font-mono">{formatNumber(line.markupPct)}%</td>
      <td className="py-2 pr-4 font-mono">
        {formatNumber(line.commissionPct)}%
        {channel.channelKind === 'DIRECT_SALE' && (
          <span className="ml-1 text-[10px] text-muted-foreground">global</span>
        )}
      </td>
      <td className="py-2 pr-4 font-mono text-muted-foreground">
        {formatNumber(line.taxBurdenPct)}%
      </td>
      <td className="py-2 pr-4 font-mono font-semibold">{formatMoney(line.finalPrice)}</td>
      <td
        className="py-2 pr-4 font-mono font-semibold text-emerald-700 dark:text-emerald-300"
        title="Ganancia de bolsillo — profit puro por unidad."
      >
        {formatMoney(line.profit)}
      </td>
    </tr>
  );
}
