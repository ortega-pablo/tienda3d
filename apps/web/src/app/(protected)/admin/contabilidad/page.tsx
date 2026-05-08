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
        title="1 · Costo unitario (Logic C v3)"
        subtitle="Reabastecimiento por insumo + recargos sobre energía y mano de obra. Profit aplicado solo sobre el precio de fabricación."
      >
        <p className="mb-3">
          La diferencia respecto a la lógica anterior: <strong>la ganancia ya no se calcula
          sobre todo el costo</strong>. Se calcula solo sobre el "precio de fabricación"
          (filamento, máquina, mano de obra, marketing y provisiones). Los <em>otros insumos</em>
          {' '}quedan afuera del profit y se suman después, recompuestos por su propio% de
          reabastecimiento. La ganancia que ves <strong>es lo que entra al bolsillo</strong>; los
          insumos extra ya tienen su recargo para reposición.
        </p>

        <Block heading="A · Filamento (con desperdicio + reabastecimiento)">
          <p>
            <Code>filamento_pieza = (gramos / 1000) × precio_kg</Code>
          </p>
          <p>
            <Code>desperdicio = filamento_pieza × wastePct / 100</Code>
          </p>
          <p>
            <Code>filamento_total = (filamento_pieza + desperdicio) × (1 + reab%/100)</Code>
          </p>
          <p>
            El <Code>reab%</Code> (campo <Code>replenishmentMarkupPct</Code>) cubre la reposición
            de stock — <strong>no es ganancia</strong>. Default 15%. Se carga por insumo en{' '}
            <Code>/insumos</Code>; las variantes (colores) lo heredan del filamento padre.
          </p>
        </Block>

        <Block heading="B · Insumos no impresos (con desperdicio + reabastecimiento)">
          <p>
            <Code>insumo_total = quantity × precio_vigente × (1 + waste%) × (1 + reab%)</Code>
          </p>
          <p>
            <strong>Importante</strong>: estos insumos se suman <em>después del profit</em>, no
            entran al cálculo del markup. Así, agregar un insumo caro al producto no infla
            artificialmente la ganancia.
          </p>
        </Block>

        <Block heading="C · Hora-máquina (con recargo de energía)">
          <p>
            <Code>energía_raw = (W / 1000) × kWh_cost</Code>
          </p>
          <p>
            <Code>
              energía = energía_raw × (1 + kwh_markup_pct/100)
            </Code>
            {' '}({get('kwh_markup_pct')}% actual)
          </p>
          <p>
            <Code>
              hora_máquina = depreciación + energía + mantenimiento
            </Code>
          </p>
          <p>
            Donde:
          </p>
          <ul className="ml-4 list-disc">
            <li>
              <Code>depreciación = (acquisition − residual) / useful_life_h</Code>
            </li>
            <li>
              <Code>mantenimiento = annual_maint / annual_usage_h</Code>
            </li>
          </ul>
          <p>
            El recargo sobre la energía cubre overhead que no entra en máquina ni provisiones
            (cortes de luz, equipo de respaldo, etc.). Se configura en{' '}
            <Code>/parametros → Recargo extra energía eléctrica</Code>.
          </p>
        </Block>

        <Block heading="D · Mano de obra (con recargo)">
          <p>
            <Code>
              labor_raw = (assemblyMin + managementMin) / 60 × labor_hour_cost
            </Code>
          </p>
          <p>
            <Code>
              labor = labor_raw × (1 + labor_markup_pct/100)
            </Code>
            {' '}({get('labor_markup_pct')}% actual)
          </p>
          <p>
            El recargo cubre tiempo improductivo, retoques, soporte post-venta. Se configura en{' '}
            <Code>/parametros → Recargo extra mano de obra</Code>.
          </p>
        </Block>

        <Block heading="E · Marketing prorrateado (por producto)">
          <p>
            <Code>marketing_unit = marketingMonthly / estimatedUnitsMonth</Code>
          </p>
        </Block>

        <Block heading="F · Precio de fabricación + costo total">
          <p>
            <Code>proceso = A + C + D + E</Code>
            {' '}<span className="text-muted-foreground">(¡sin B!)</span>
          </p>
          <p>
            <Code>
              precio_fabricación = proceso × (1 + contingency%/100 + reinvestment%/100)
            </Code>
          </p>
          <p>
            <Code>
              costo_total = precio_fabricación + B
            </Code>
          </p>
          <p>
            El <strong>precio de fabricación</strong> es la base para el profit (ver sección 2).
            El <strong>costo total</strong> es el costo absoluto del producto y se usa para
            reportes y márgenes brutos.
          </p>
        </Block>

        <p className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          <strong>Ejemplo Cuaderno A5</strong> (15% reab. en filamento + hojas, 5% en obra y
          energía, 60% markup, 5% contingencia, 10% reinversión):
          <br />
          A_con_reab = 4.002,17 × 1,15 = 4.602,50 · B_con_reab = 2.855,04 × 1,15 = 3.283,30 ·
          C ≈ 1.837,72 (incluye recargo de energía) · D = 5.000 × 1,05 = 5.250 ·
          E = 750.
          <br />
          <strong>proceso</strong> = 4.602,50 + 1.837,72 + 5.250 + 750 = 12.440,22 ·
          <strong> precio_fabricación</strong> = 12.440,22 × 1,15 = 14.306,25 ·
          <strong> costo_total</strong> = 14.306,25 + 3.283,30 = 17.589,55.
        </p>
      </Section>

      <Section
        icon={<Coins className="h-5 w-5 text-primary" />}
        title="2 · Precio y ganancia de bolsillo (Logic C v3)"
        subtitle="Profit aplicado solo sobre el precio de fabricación. Otros insumos pasan post-profit con su propio reabastecimiento."
      >
        <Block heading="Fórmula">
          <p className="font-mono">profit = precio_fabricación × markup%</p>
          <p className="font-mono">
            pre_comisión = precio_fabricación + profit + Σ otros_insumos_con_reab
          </p>
          <p className="font-mono">denominador = 1 − comisión% − régimen%</p>
          <p className="font-mono">precio_final = pre_comisión / denominador</p>
        </Block>

        <Block heading="Por qué el profit es fijo entre canales">
          <p>
            El <Code>profit</Code> sale solo de <Code>precio_fabricación × markup</Code> — no
            depende de la comisión ni del régimen. Para que la ecuación cierre, el precio
            sube en canales con más comisión (MELI) y baja en canales sin comisión (Efectivo),
            pero <strong>la ganancia que entra a tu bolsillo es siempre la misma</strong>.
          </p>
          <p>
            Y como los <em>otros insumos</em> tampoco entran al markup, agregar un insumo más
            caro al producto no infla la ganancia: solo recompone su propio costo.
          </p>
        </Block>

        <Block heading="Diferencia con la lógica anterior (Logic B)">
          <p>
            Antes (Logic B):{' '}
            <Code>profit = costo_con_provisiones × markup%</Code>. La ganancia incluía un
            recargo sobre todos los insumos extra — eso significaba que insumos como packaging
            o hojas inflaban el profit aunque no los hubieras pagado vos como ganancia, sino
            como costo de reposición. Logic C v3 separa los dos roles: <em>reab%</em> repone, {' '}
            <em>markup%</em> da ganancia.
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
            <strong>Excepción: canales CASH (Contado S/F)</strong> están exentos de régimen por
            naturaleza — operan sin factura, así que la deducción no corresponde. El motor
            fuerza <Code>régimen = 0</Code> para todo canal con <Code>kind = CASH</Code>,
            independientemente del valor global. El profit del vendedor sigue siendo el mismo
            entre canales (Logic C v3:{' '}
            <Code>fabricationPrice × markup</Code>).
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
        title="3 · Cotizaciones — snapshot de costo, precio y ganancia"
      >
        <p>
          Cada item de cotización <strong>congela</strong> los valores al momento de creación:
        </p>
        <ul className="ml-4 list-disc">
          <li>
            <Code>unitCost</Code> = costo total del producto al momento.
          </li>
          <li>
            <Code>unitPrice</Code> = precio resuelto por el <Code>PricingEngine</Code> con la
            escala que aplica a esa cantidad.
          </li>
          <li>
            <Code>unitProfit</Code> = ganancia de bolsillo por unidad{' '}
            (<Code>fabricación × markup%</Code>) — fija entre canales.
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
          La página de detalle muestra la ganancia por línea + el subtotal de ganancia del
          presupuesto.
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
