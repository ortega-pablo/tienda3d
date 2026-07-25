import { formatMoney, formatNumber } from '@/lib/format';
import type { QuoteItemPricingBreakdown } from './quote-actions';

/**
 * Panel colapsable con el desglose de cálculo de un ítem (costo Logic C v3 +
 * precio: markup, comisión, régimen, ganancia y margen). Solo se renderiza para
 * admins (el server lo gatea por permiso) y cuando hay snapshot. Server
 * component: usa `<details>` nativo, sin JS de cliente.
 */
export function QuoteItemBreakdown({ breakdown }: { breakdown: QuoteItemPricingBreakdown }) {
  const { cost, price, context } = breakdown;
  const otherWithReab = cost.materials.totalWithReplenishment;
  const rounded = (context.roundingStep ?? 0) > 0;

  // Ficha técnica: gramos y tiempo de impresión por unidad (para keychain con
  // base tanda, el snapshot ya viene dividido ÷ tanda, así que es por llavero).
  const pieces = cost.filament.items ?? [];
  const totalGrams = pieces.reduce((acc, p) => acc + p.grams, 0);
  const totalMinutes = cost.filament.totalMinutes;

  return (
    <details className="group rounded-md border bg-muted/20">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground marker:content-[''] hover:text-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="transition-transform group-open:rotate-90">▸</span>
          Ver desglose del cálculo (admin)
        </span>
      </summary>
      <div className="grid gap-4 border-t px-3 py-3 sm:grid-cols-2">
        {/* Costo */}
        <div>
          {/* Ficha técnica: gramos + tiempo de impresión por unidad */}
          <div className="mb-2 rounded-md border bg-background/60 px-2.5 py-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ficha técnica (por unidad)
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Gramos de filamento</span>
              <span className="font-mono font-medium">{formatNumber(totalGrams, 2)} g</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Tiempo de impresión</span>
              <span className="font-mono font-medium">{formatMinutes(totalMinutes)}</span>
            </div>
            {pieces.length > 1 && (
              <div className="mt-1.5 space-y-0.5 border-t pt-1.5">
                {pieces.map((p, idx) => (
                  <div
                    key={`${p.pieceName}-${idx}`}
                    className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                  >
                    <span className="truncate">{p.pieceName}</span>
                    <span className="whitespace-nowrap font-mono">
                      {formatNumber(p.grams, 2)} g · {formatMinutes(p.printMinutes)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Costo unitario (Logic C v3)
          </div>
          <dl className="space-y-0.5 text-sm">
            <Row
              label="Filamento"
              value={cost.filament.totalWithReplenishment}
              sub={
                cost.filament.replenishment > 0
                  ? `${formatNumber(cost.filament.totalMinutes, 0)} min · incl. ${formatMoney(cost.filament.replenishment)} reab.`
                  : `${formatNumber(cost.filament.totalMinutes, 0)} min`
              }
            />
            <Row
              label="Hora-máquina"
              value={cost.machine.total}
              sub={`${formatMoney(cost.machine.perHour)}/h`}
            />
            <Row
              label="Mano de obra"
              value={cost.labor.total}
              sub={
                cost.labor.markupAmount > 0
                  ? `${formatNumber(cost.labor.minutes, 0)} min · incl. ${formatMoney(cost.labor.markupAmount)} recargo`
                  : `${formatNumber(cost.labor.minutes, 0)} min`
              }
            />
            {cost.marketing.perUnit > 0 && (
              <Row label="Marketing" value={cost.marketing.perUnit} />
            )}
            <Row label="+ Contingencia" value={cost.contingency} muted />
            <Row label="+ Reinversión" value={cost.reinvestment} muted />
            <Divider />
            <Row label="Precio de fabricación" value={cost.fabricationPrice} bold />
            {context.customerAdjusted && context.fabricationPriceUsed != null && (
              <Row
                label="Fabricación usada (cliente)"
                value={context.fabricationPriceUsed}
                sub="recombinado por flags del cliente"
              />
            )}
            {otherWithReab > 0 && (
              <>
                <Divider />
                <Row label="Otros insumos (post-profit)" value={otherWithReab} />
              </>
            )}
            <Divider />
            <Row label="Costo total" value={cost.totalCost} bold />
          </dl>
        </div>

        {/* Precio */}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Precio y ganancia
          </div>
          {price ? (
            <dl className="space-y-0.5 text-sm">
              <RowPct label="Markup aplicado" value={price.markupPct} />
              <RowPct label="Comisión de canal" value={price.commissionPct} />
              <RowPct label="Régimen / impuestos" value={price.taxBurdenPct} muted />
              <Divider />
              <Row label="Precio neto" value={price.netPrice} />
              <Row label="Precio final" value={price.finalPrice} bold />
              <Row label="Ganancia / unidad" value={price.profit} emerald />
              <RowPct label="Margen efectivo" value={price.effectiveMarginPct} muted />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin canal — el precio es igual al costo.
            </p>
          )}

          {/* Contexto */}
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            {context.pricingBase && (
              <p>
                Base:{' '}
                <strong>
                  {context.pricingBase === 'INDIVIDUAL'
                    ? 'individual (1 unidad)'
                    : `tanda ÷ ${context.batchSize ?? 5}`}
                </strong>
                {context.scaleLabel && (
                  <>
                    {' '}
                    · escala <strong>{context.scaleLabel}</strong> (markup{' '}
                    {formatNumber(context.scaleMarkupPct ?? 0)}%)
                  </>
                )}
              </p>
            )}
            {context.designRaw != null && context.designRaw > 0 && (
              <p>
                Cargo de diseño: crudo {formatMoney(context.designRaw)} → final{' '}
                {formatMoney(context.designSurcharge ?? 0)} (plano, no escala con la cantidad).
              </p>
            )}
            {rounded && (
              <p>
                Precio final redondeado hacia arriba a múltiplo de {formatMoney(context.roundingStep!)}.
                El margen mostrado es exacto (el excedente de redondeo es ganancia extra no
                contabilizada).
              </p>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

function Row({
  label,
  value,
  sub,
  bold,
  muted,
  emerald,
}: {
  label: string;
  value: number;
  sub?: string;
  bold?: boolean;
  muted?: boolean;
  emerald?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${muted ? 'text-muted-foreground' : ''}`}>
      <div>
        <div className={bold ? 'font-medium' : ''}>{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </div>
      <div
        className={`font-mono ${bold ? 'font-semibold' : ''} ${
          emerald ? 'text-emerald-700 dark:text-emerald-300' : ''
        }`}
      >
        {formatMoney(value)}
      </div>
    </div>
  );
}

function RowPct({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${muted ? 'text-muted-foreground' : ''}`}>
      <div>{label}</div>
      <div className="font-mono">{formatNumber(value)}%</div>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t" />;
}

/** Minutos → "Xh Ym" (o "Ym" si es menos de una hora). */
function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
