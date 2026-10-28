'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Trash2, Upload } from 'lucide-react';
import { apiErrorFromResponse, type WebImageDto, type WebProductDto } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { mediaUrl } from '@/lib/media';
import { useConfirm } from '@/components/confirm-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { TabProps } from './publication-editor';

/** Subida multipart: el cliente de la API solo manda JSON. */
async function upload(productId: string, files: FileList): Promise<WebProductDto> {
  const body = new FormData();
  for (const file of Array.from(files)) body.append('files', file);
  const res = await fetch(`/api/web-catalog/products/${productId}/images`, {
    method: 'POST',
    body,
    credentials: 'include',
  });
  if (!res.ok) throw await apiErrorFromResponse(res);
  return (await res.json()) as WebProductDto;
}

function Photo({
  image,
  index,
  total,
  product,
  run,
  canWrite,
  onDragStart,
  onDrop,
}: TabProps & {
  image: WebImageDto;
  index: number;
  total: number;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const confirm = useConfirm();
  const [alt, setAlt] = useState(image.alt);
  const colors = product.colorOptions
    .filter((o) => o.isActive)
    .flatMap((o) => o.values.map((v) => ({ id: v.materialId, label: v.color ?? v.name })));
  const patch = (body: object, success: string) =>
    run(
      () =>
        api<WebProductDto>(`/web-catalog/products/${product.id}/images/${image.id}`, {
          method: 'PATCH',
          body,
        }),
      success,
    );

  return (
    <li
      draggable={canWrite}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="space-y-2 rounded-md border bg-card p-2"
    >
      <div className="relative aspect-square overflow-hidden rounded bg-muted">
        {/* Pasa por la sesión del proxy: next/image la pediría sin cookies. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(image.path)}
          alt={image.alt}
          loading="lazy"
          className="h-full w-full object-cover"
        />
        {index === 0 && (
          <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-0.5 text-xs font-medium">
            Portada
          </span>
        )}
      </div>
      <Input
        aria-label="Texto alternativo"
        placeholder="Qué se ve en la foto"
        value={alt}
        disabled={!canWrite}
        onChange={(e) => setAlt(e.target.value)}
        onBlur={() => alt !== image.alt && patch({ alt }, 'Texto alternativo guardado')}
        className="h-9"
        maxLength={200}
      />
      {colors.length > 0 && (
        <Select
          aria-label="Color de la foto"
          value={image.colorMaterialId ?? ''}
          disabled={!canWrite}
          onChange={(e) =>
            patch({ colorMaterialId: e.target.value || null }, 'Color de la foto guardado')
          }
          className="[&_select]:h-9"
        >
          <option value="">Todos los colores</option>
          {colors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      )}
      {canWrite && (
        <div className="flex justify-between">
          <span className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mover antes"
              disabled={index === 0}
              onClick={() => patch({ position: index - 1 }, 'Orden guardado')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mover después"
              disabled={index === total - 1}
              onClick={() => patch({ position: index + 1 }, 'Orden guardado')}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Borrar foto"
            onClick={async () => {
              const ok = await confirm({
                title: '¿Borrar la foto?',
                description:
                  'Se borra el archivo. Las variantes que la usaban quedan sin foto propia.',
                confirmLabel: 'Borrar',
                variant: 'destructive',
              });
              if (ok) {
                await run(
                  () =>
                    api<WebProductDto>(`/web-catalog/products/${product.id}/images/${image.id}`, {
                      method: 'DELETE',
                    }),
                  'Foto borrada',
                );
              }
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )}
    </li>
  );
}

export function PhotosTab(props: TabProps) {
  const { product, run, canWrite } = props;
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const images = product.images;

  const moveTo = (target: number) => {
    if (!dragging) return;
    const id = dragging;
    setDragging(null);
    if (images.findIndex((i) => i.id === id) === target) return;
    void run(
      () =>
        api<WebProductDto>(`/web-catalog/products/${product.id}/images/${id}`, {
          method: 'PATCH',
          body: { position: target },
        }),
      'Orden guardado',
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Fotos</CardTitle>
            <CardDescription>
              JPG, PNG o WebP de hasta 15 MB; se guardan como WebP de 2000 px sin datos de la
              cámara. Arrastrá para ordenar: la primera es la portada.
            </CardDescription>
          </div>
          {canWrite && (
            <>
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={async (e) => {
                  const files = e.target.files;
                  if (files?.length) await run(() => upload(product.id, files), 'Fotos subidas');
                  e.target.value = '';
                }}
              />
              <Button onClick={() => input.current?.click()}>
                <Upload className="h-4 w-4" />
                Subir fotos
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {images.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin fotos. Una publicación necesita al menos una para publicarse.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((image, index) => (
              <Photo
                key={image.id}
                {...props}
                image={image}
                index={index}
                total={images.length}
                onDragStart={() => setDragging(image.id)}
                onDrop={() => moveTo(index)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
