import { Calculator, ClipboardList, Coins, Factory, Receipt, ShieldCheck } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { api } from '@/lib/api-server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface GlobalParam {
  key: string;
  value: string;
  description: string | null;
}

const SECTION_CLS = 'rounded-md border bg-muted/20 p-4';

export default async function AccountingPage() {
  // Admin-only — gate by user:manage so operadores no acceden.
  await requirePermission('user:manage');
  const params = await api<GlobalParam[]>('/parameters');
  const get = (key: string) => params.find((p) => p.key === key)?.value ?? '—';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Métodos de cálculo y procesos contables</h1>
        <p className="text-muted-foreground">
          Documentación técnica del sistema. Todo lo que sigue se aplica de forma automática al
          calcular costos, precios y al registrar movimientos contables.
        </p>
      </header>

      <Section
        icon={<Calculator className="h-5 w-5 text-primary" />}
        title="1 · Costo unitario del producto"
        subtitle="Replicado de cotizador_cuaderno_plastik_v2.xlsx, validado por tests automáticos"
      >
        <p className="mb-3">
          El costo unitario suma cinco componentes y agrega provisiones. Cada componente se
          calcula así:
        </p>

        <Block heading="A · Filamento (con desperdicio por insumo)">
          <p>
            <Code>filamento_pieza = (gramos / 1000) × precio_kg</Code>
          </p>
          <p>
            <Code>desperdicio_pieza = filamento_pieza × wastePct_filamento / 100</Code>
          </p>
          <p>
            Cada filamento (marca + color = SKU independiente) tiene su propio
            <Code>wastePct</Code> en el catálogo de insumos. Se suma por todas las piezas del
            producto.
          </p>
        </Block>

        <Block heading="B · Insumos no impresos">
          <p>
            <Code>insumo = quantity × precio_vigente × (1 + wastePct / 100)</Code>
          </p>
          <p>
            El <em>precio vigente</em> sale de <Code>SupplierMaterial.isCurrent = true</Code> en
            el histórico de precios por proveedor.
          </p>
        </Block>

        <Block heading="C · Hora-máquina">
          <p>
            <Code>tiempo_h = sum(piezas.printMinutes) / 60</Code>
          </p>
          <p>
            <Code>
              hora_maquina = depreciación + energía + mantenimiento
            </Code>
          </p>
          <p>
            Donde:
          </p>
          <ul className="ml-4 list-disc">
            <li>
              <Code>depreciación = (acquisition - residual) / useful_life_h</Code>
            </li>
            <li>
              <Code>energía = (W / 1000) × kWh_cost</Code>
            </li>
            <li>
              <Code>mantenimiento = annual_maint / annual_usage_h</Code>
            </li>
          </ul>
          <p>
            La máquina activa se elige desde <Code>/equipos</Code>. Solo una está activa por vez.
          </p>
        </Block>

        <Block heading="D · Mano de obra">
          <p>
            <Code>
              labor = (assemblyMin + managementMin) / 60 × labor_hour_cost
            </Code>
          </p>
        </Block>

        <Block heading="E · Marketing prorrateado (por producto)">
          <p>
            <Code>marketing_unit = marketingMonthly / estimatedUnitsMonth</Code>
          </p>
          <p>
            Cada producto declara su propio presupuesto y unidades estimadas — distinto al Excel
            original donde era global.
          </p>
        </Block>

        <Block heading="F · Provisiones">
          <p>
            <Code>producción = A + B + C + D + E</Code>
          </p>
          <p>
            <Code>
              costo_con_provisiones = producción × (1 + contingencyPct/100 + reinvestmentPct/100)
            </Code>
          </p>
        </Block>

        <p className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          Ejemplo del Cuaderno A5 con la receta original del Excel: A={`$4.002,17`} +{' '}
          B={`$2.855,04`} + C={`$1.837,72`} + D={`$5.000,00`} + E={`$750,00`} ={' '}
          <strong>{`$14.444,93`}</strong>; con +5% contingencia y +10% reinversión queda{' '}
          <strong>{`$16.611,66`}</strong>. Ese valor es lo que el sistema llama{' '}
          <Code>costWithProvisions</Code>.
        </p>
      </Section>

      <Section
        icon={<Coins className="h-5 w-5 text-primary" />}
        title="2 · Precio y ganancia (Lógica B — markup sobre costo)"
        subtitle="Ganancia absoluta fija por unidad, igual en todos los canales"
      >
        <Block heading="Fórmula">
          <p className="font-mono">profit = costo × markup%</p>
          <p className="font-mono">denominador = 1 − comisión% − régimen%</p>
          <p className="font-mono">precio_final = (costo + profit) / denominador</p>
        </Block>

        <Block heading="Por qué el profit es fijo entre canales">
          <p>
            La ganancia absoluta sale solo de <Code>cost × markup</Code>. La comisión y el régimen
            se descuentan del precio que paga el cliente, no del bolsillo del vendedor. Para que
            la ecuación cierre, el precio sube en canales con más comisión (MELI) y baja en
            canales sin comisión (Efectivo) — pero <strong>vos ganás siempre lo mismo</strong>.
          </p>
        </Block>

        <Block heading="Diferencia con la fórmula del Excel">
          <p>
            El Excel original usaba <em>margen sobre precio</em>:{' '}
            <Code>precio = costo / (1 − margen − comisión − régimen)</Code>. Esa fórmula daba{' '}
            <em>ganancias distintas por canal</em> (más en MELI, menos en Efectivo) y dificultaba
            comparar productos. La migración convirtió todos los productos a{' '}
            <Code>markup = margen / (1 − margen − dir_com − régimen)</Code>, que preserva el
            precio de Venta Directa pero unifica la ganancia.
          </p>
        </Block>

        <Block heading="Resolución del markup">
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              Si la cantidad cae dentro de una <Code>ProductPriceTier</Code>, se usa el{' '}
              <Code>markupPct</Code> de la escala.
            </li>
            <li>
              Si no, se usa el <Code>targetMarkupPct</Code> del producto (campo{' '}
              <Code>products.targetMarkupPct</Code>).
            </li>
          </ol>
        </Block>

        <Block heading="Resolución de la comisión por tipo de canal">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>DIRECT_SALE</strong> · global, viene del parámetro{' '}
              <Code>direct_sale_commission_pct</Code> ({get('direct_sale_commission_pct')}%
              actual). No se puede sobreescribir por producto ni por escala.
            </li>
            <li>
              <strong>CASH</strong> · siempre 0%.
            </li>
            <li>
              <strong>MARKETPLACE</strong> · cargada en{' '}
              <Code>ProductChannel.commissionPct</Code> al habilitar el canal. El producto no
              guarda si no la cargás.
            </li>
            <li>
              <strong>CUSTOM</strong> · default del canal, override por escala.
            </li>
          </ul>
        </Block>

        <Block heading="Régimen tributario (modelo simple, hoy)">
          <p>
            El régimen unificado es global: parámetro <Code>unified_regime_pct</Code> (
            {get('unified_regime_pct')}% actual). Se aplica a todo canal en modo SIMPLE y se
            descuenta del denominador. Se edita desde la página de Canales (Configuración global
            de pricing).
          </p>
          <p>
            Para canales <strong>CASH</strong>, los usuarios con permiso{' '}
            <Code>pricing:no-invoice:read</Code> pueden activar el toggle{' '}
            <em>"Sin factura"</em> que recalcula el precio sin régimen. Útil para informar al
            cliente cuánto sale "en negro" — el profit del vendedor no cambia (sigue siendo{' '}
            <Code>cost × markup</Code>).
          </p>
        </Block>

        <Block heading="Modelo detallado (preparado, opt-in por canal)">
          <p>
            Cuando un canal usa <Code>taxMode = DETAILED</Code>, el régimen se desglosa en IIBB +
            retenciones de IVA/IIBB/Ganancias y, opcionalmente, se aplica IVA 21% al precio
            final. Hoy todos los canales del sistema están en modo SIMPLE; el modo detallado se
            activa cuando se integre AFIP/ARCA.
          </p>
        </Block>
      </Section>

      <Section
        icon={<Factory className="h-5 w-5 text-primary" />}
        title="3 · Cotizaciones — snapshot de costo y precio"
      >
        <p>
          Cada item de cotización <strong>congela</strong> los valores al momento de creación:
        </p>
        <ul className="ml-4 list-disc">
          <li>
            <Code>unitCost</Code> = costo con provisiones del producto al momento.
          </li>
          <li>
            <Code>unitPrice</Code> = precio resuelto por el <Code>PricingEngine</Code> con la
            escala que aplica a esa cantidad.
          </li>
          <li>
            <Code>lineTotal</Code> = <Code>unitPrice × quantity</Code>.
          </li>
        </ul>
        <p>
          Si después cambia el costo del PLA o el markup del producto,{' '}
          <strong>las cotizaciones existentes no se recalculan</strong>. Las nuevas sí.
        </p>
        <p>
          Códigos: <Code>Q-YYYY-NNNN</Code> para cotizaciones de productos del catálogo,{' '}
          <Code>R-YYYY-NNNN</Code> para cotizaciones rápidas (ad-hoc).
        </p>
      </Section>

      <Section
        icon={<Receipt className="h-5 w-5 text-primary" />}
        title="4 · Stock y producción"
      >
        <p>
          Las órdenes de producción tipo <Code>ProductionOrder</Code> recorren el ciclo{' '}
          <Code>PLANNED → IN_PROGRESS → DONE</Code>. Al pasar a <Code>DONE</Code>, en una sola
          transacción:
        </p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            Se descuenta de <Code>materials.currentStock</Code> la cantidad recetada (gramos para
            filamentos, unidades/metros para insumos), aplicando el desperdicio del insumo.
          </li>
          <li>
            Se crea un <Code>StockMovement</Code> tipo <Code>OUT</Code> con referencia a la OP.
          </li>
        </ol>
        <p>
          Los ajustes manuales desde <Code>/insumos</Code> generan movimientos tipo{' '}
          <Code>ADJUSTMENT</Code> con notas obligatorias.
        </p>
        <p>
          La <Code>StockMovement.unitCost</Code> se completa al ingresar mercadería; al consumir
          en producción se deja vacío (el costeo en producción usa el precio vigente del
          insumo, no el costo histórico — pendiente migrar a método FIFO/promedio si lo
          necesitás).
        </p>
      </Section>

      <Section
        icon={<ClipboardList className="h-5 w-5 text-primary" />}
        title="5 · Auditoría — qué se registra"
      >
        <p>
          La tabla <Code>AuditLog</Code> guarda <Code>before/after</Code> en JSON para los
          cambios sensibles. Hoy se loguea automáticamente en:
        </p>
        <ul className="ml-4 list-disc">
          <li>
            <strong>Parámetros globales</strong> — cambios en <Code>kWh</Code>, mano de obra,
            contingencia, etc. (uno por clave que cambia).
          </li>
          <li>
            <strong>Roles</strong> — cuando se altera la lista de permisos de un rol.
          </li>
          <li>
            <strong>Cotizaciones</strong> — transiciones de estado.
          </li>
          <li>
            <strong>Producciones</strong> — transiciones de estado (incluye el cambio a DONE
            que dispara el descuento de stock).
          </li>
        </ul>
        <p>
          El listado completo está en <Code>/admin/auditoria</Code> con filtro por entidad.
        </p>
      </Section>

      <Section
        icon={<ShieldCheck className="h-5 w-5 text-primary" />}
        title="6 · Permisos sensibles"
      >
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <Code>parameter:write</Code> — modificar parámetros globales (afecta el precio de
            todos los productos).
          </li>
          <li>
            <Code>pricing:no-invoice:read</Code> — ver el toggle "Efectivo sin régimen". Solo
            admins.
          </li>
          <li>
            <Code>role:manage</Code> y <Code>user:manage</Code> — gestionar permisos. Los roles{' '}
            <Code>admin</Code>/<Code>operator</Code>/<Code>viewer</Code> son del sistema y no se
            pueden eliminar.
          </li>
          <li>
            <Code>audit:read</Code> — ver el log de auditoría.
          </li>
          <li>
            <Code>production:execute</Code> — disparar el descuento de stock vía OP.
          </li>
        </ul>
      </Section>

      <Section
        icon={<Calculator className="h-5 w-5 text-primary" />}
        title="7 · Parámetros globales en uso"
      >
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Clave</th>
                <th className="px-3 py-2 text-left">Valor actual</th>
                <th className="px-3 py-2 text-left">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {params.map((p) => (
                <tr key={p.key}>
                  <td className="px-3 py-2 font-mono text-xs">{p.key}</td>
                  <td className="px-3 py-2 font-mono">{p.value}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

function Block({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className={SECTION_CLS}>
      <p className="mb-2 font-semibold">{heading}</p>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{children}</code>
  );
}
