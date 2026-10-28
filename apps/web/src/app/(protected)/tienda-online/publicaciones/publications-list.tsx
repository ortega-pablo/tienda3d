'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImageOff, Plus } from 'lucide-react';
import type { WebProductDto, WebProductStatusValue, WebProductSummaryDto } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { handleApiError } from '@/lib/handle-error';
import { mediaUrl } from '@/lib/media';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ALERT_LABEL, STATUS_LABEL } from '../web-labels';

function priceRange(p: WebProductSummaryDto): string {
  if (p.priceMin == null || p.priceMax == null) return '—';
  if (p.priceMin === p.priceMax) return formatMoney(p.priceMin);
  return `${formatMoney(p.priceMin)} – ${formatMoney(p.priceMax)}`;
}

export function PublicationsList({
  publications,
  canWrite,
}: {
  publications: WebProductSummaryDto[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | WebProductStatusValue>('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return publications.filter(
      (p) =>
        (!status || p.status === status) && (!q || `${p.name} ${p.slug}`.toLowerCase().includes(q)),
    );
  }, [publications, query, status]);

  const create = async () => {
    setSaving(true);
    try {
      const created = await api<WebProductDto>('/web-catalog/products', {
        method: 'POST',
        body: { name: name.trim() },
      });
      router.push(`/tienda-online/publicaciones/${created.id}`);
    } catch (err) {
      handleApiError(err);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Publicaciones</h1>
          <p className="text-muted-foreground">
            Lo que la tienda muestra como un producto: uno o más productos del sistema, con sus
            fotos, colores y opciones.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Nueva publicación
          </Button>
        )}
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>{filtered.length} publicaciones</CardTitle>
              <CardDescription>
                El precio es el de Venta Directa a cliente normal de cada producto del sistema.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="pub-buscar" className="text-xs text-muted-foreground">
                  Buscar
                </Label>
                <Input
                  id="pub-buscar"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nombre o slug…"
                  className="h-9 w-48"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pub-estado" className="text-xs text-muted-foreground">
                  Estado
                </Label>
                <Select
                  id="pub-estado"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as '' | WebProductStatusValue)}
                  className="w-40 [&_select]:h-9"
                >
                  <option value="">Todos</option>
                  {Object.entries(STATUS_LABEL).map(([value, s]) => (
                    <option key={value} value={value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {publications.length === 0
                ? 'Todavía no hay publicaciones. Creá una o hacelo desde la ficha de un producto.'
                : 'Ninguna publicación coincide con el filtro.'}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/tienda-online/publicaciones/${p.id}`}
                    className="flex items-center gap-4 rounded-md px-2 py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                      {p.coverImagePath ? (
                        // Pasa por la sesión del proxy: next/image la pediría sin cookies.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mediaUrl(p.coverImagePath)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageOff aria-hidden className="h-5 w-5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        <Badge variant={STATUS_LABEL[p.status].variant}>
                          {STATUS_LABEL[p.status].label}
                        </Badge>
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {p.alerts.map((a) => (
                          <Badge key={a} variant={ALERT_LABEL[a].variant}>
                            {ALERT_LABEL[a].label}
                          </Badge>
                        ))}
                      </span>
                    </span>
                    <span className="hidden text-right text-sm sm:block">
                      <span className="block font-medium">{priceRange(p)}</span>
                      <span className="block text-muted-foreground">
                        {p.activeVariantCount}/{p.variantCount} variantes activas
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) setName('');
        }}
        title="Nueva publicación"
        description="Después elegís los productos del sistema, los colores y las fotos."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={create} disabled={saving || !name.trim()}>
              Crear y seguir
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void create();
          }}
          className="space-y-2"
        >
          <Label htmlFor="pub-nombre">Nombre en la tienda</Label>
          <Input
            id="pub-nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lámpara Trapecio — Mesa"
            maxLength={160}
          />
        </form>
      </Dialog>
    </div>
  );
}
