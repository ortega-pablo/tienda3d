import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeychainBatchSizeForm } from './keychain-batch-size-form';
import {
  KeychainDefaultsForm,
  type FilamentOption,
  type KeychainDefaultsDto,
  type MaterialOption,
} from './keychain-defaults-form';
import {
  KeychainScaleTiersForm,
  type KeychainScaleTierDto,
} from './keychain-scale-tiers-form';

interface ParamDto {
  key: string;
  value: string;
}

const DEFAULT_BATCH_SIZE = 5;

export default async function KeychainConfigPage() {
  await requirePermission('parameter:read');

  const [scaleTiers, defaults, params, filaments, materials] = await Promise.all([
    api<KeychainScaleTierDto[]>('/keychain-scale-tiers'),
    api<KeychainDefaultsDto>('/keychain-defaults'),
    api<ParamDto[]>('/parameters'),
    api<FilamentOption[]>('/materials?type=FILAMENT&activeOnly=true'),
    api<MaterialOption[]>('/materials?activeOnly=true'),
  ]);
  const nonFilaments = materials.filter((m) => m.type !== 'FILAMENT');

  const batchSizeParam = params.find((p) => p.key === 'keychain_batch_size');
  const batchSize = batchSizeParam
    ? Math.max(1, Math.floor(Number(batchSizeParam.value)))
    : DEFAULT_BATCH_SIZE;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Configuración de llaveros</h1>
        <p className="text-muted-foreground">
          Parametrización del flujo de cotización de llaveros: tamaño del batch, escala
          de markups y valores precargados en cada cotización nueva.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Tamaño del batch</CardTitle>
          <CardDescription>
            Define cómo se interpretan los inputs (gramos, minutos, consumos) en la
            cotización: totales para producir esta cantidad de llaveros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeychainBatchSizeForm initial={batchSize} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Markups por escala</CardTitle>
          <CardDescription>
            Escala fija y contigua de 5 tramos (1-4, 5-24, 25-49, 50-99, 100+),
            compartida por los productos de catálogo tipo llavero y el cotizador de
            llaveros. La escala 1-4 usa la base de piezas individual; el resto la base de
            tanda ÷ 5. Solo se edita el markup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeychainScaleTiersForm initial={scaleTiers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Valores precargados</CardTitle>
          <CardDescription>
            Pieza, insumos y tiempos que aparecen por default al abrir una cotización de
            llaveros nueva. Sirven como punto de partida — el vendedor puede editarlos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeychainDefaultsForm
            initial={defaults}
            filaments={filaments}
            nonFilaments={nonFilaments}
            batchSize={batchSize}
          />
        </CardContent>
      </Card>
    </div>
  );
}
