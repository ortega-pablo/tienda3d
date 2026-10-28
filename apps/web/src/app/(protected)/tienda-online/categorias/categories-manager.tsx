'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageOff, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  apiErrorFromResponse,
  type WebCategoryCreateInput,
  type WebCategoryDto,
} from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { mediaUrl } from '@/lib/media';
import { useConfirm } from '@/components/confirm-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Form = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  parentId: string;
  sortOrder: string;
  isActive: boolean;
};

const empty = (parentId = ''): Form => ({
  name: '',
  slug: '',
  description: '',
  parentId,
  sortOrder: '0',
  isActive: true,
});

/** Subida multipart: el cliente de la API solo manda JSON. */
async function uploadPhoto(id: string, file: File): Promise<WebCategoryDto> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/web-catalog/categories/${id}/image`, {
    method: 'POST',
    body,
    credentials: 'include',
  });
  if (!res.ok) throw await apiErrorFromResponse(res);
  return (await res.json()) as WebCategoryDto;
}

export function CategoriesManager({
  initialCategories,
  canWrite,
}: {
  initialCategories: WebCategoryDto[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const categories = initialCategories;
  const roots = categories.filter((c) => c.parentId === null);
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id);

  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      router.refresh();
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!form) return;
    const body: WebCategoryCreateInput = {
      name: form.name.trim(),
      description: form.description,
      parentId: form.parentId || null,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
      ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
    };
    const ok = await act(
      () =>
        form.id
          ? api(`/web-catalog/categories/${form.id}`, { method: 'PATCH', body })
          : api('/web-catalog/categories', { method: 'POST', body }),
      form.id ? 'Categoría guardada' : 'Categoría creada',
    );
    if (ok) setForm(null);
  };

  const edit = (c: WebCategoryDto) =>
    setForm({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      parentId: c.parentId ?? '',
      sortOrder: String(c.sortOrder),
      isActive: c.isActive,
    });

  const remove = async (c: WebCategoryDto) => {
    const ok = await confirm({
      title: `¿Borrar "${c.name}"?`,
      description:
        'Si tiene publicaciones o subcategorías no se puede: sacalas primero o desactivala.',
      confirmLabel: 'Borrar',
      variant: 'destructive',
    });
    if (ok)
      await act(
        () => api(`/web-catalog/categories/${c.id}`, { method: 'DELETE' }),
        'Categoría borrada',
      );
  };

  const row = (c: WebCategoryDto, child: boolean) => (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60 ${child ? 'ml-10' : ''}`}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {c.imagePath ? (
          // Pasa por la sesión del proxy: next/image la pediría sin cookies.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(c.imagePath)} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageOff aria-hidden className="h-4 w-4 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{c.name}</span>
          {!c.isActive && <Badge variant="outline">Inactiva</Badge>}
        </span>
        <span className="block text-xs text-muted-foreground">
          /{c.slug} · {c.productCount} publicación(es) · orden {c.sortOrder}
        </span>
      </span>
      {canWrite && (
        <span className="flex gap-1">
          {!child && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setForm(empty(c.id))}>
              <Plus className="h-4 w-4" />
              Subcategoría
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Foto de ${c.name}`}
            disabled={busy}
            onClick={() => {
              setPhotoFor(c.id);
              fileInput.current?.click();
            }}
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Editar ${c.name}`}
            disabled={busy}
            onClick={() => edit(c)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Borrar ${c.name}`}
            disabled={busy}
            onClick={() => remove(c)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Categorías de la tienda</h1>
          <p className="text-muted-foreground">
            Cómo se navega la vidriera, en dos niveles. No cambian ningún precio: esos dependen de
            las categorías del sistema.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setForm(empty())}>
            <Plus className="h-4 w-4" />
            Nueva categoría
          </Button>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{categories.length} categorías</CardTitle>
          <CardDescription>
            Se muestran en el orden indicado; la foto arma la tarjeta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roots.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay categorías.
            </p>
          ) : (
            <ul className="divide-y">
              {roots.map((root) => (
                <li key={root.id} className="py-1">
                  {row(root, false)}
                  {childrenOf(root.id).map((child) => (
                    <div key={child.id}>{row(child, true)}</div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file && photoFor) await act(() => uploadPhoto(photoFor, file), 'Foto guardada');
          setPhotoFor(null);
        }}
      />

      <Dialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
        title={form?.id ? 'Editar categoría' : 'Nueva categoría'}
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={busy || !form?.name.trim()}>
              Guardar
            </Button>
          </>
        }
      >
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cat-nombre">Nombre</Label>
              <Input
                id="cat-nombre"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-slug">Dirección (slug)</Label>
              <Input
                id="cat-slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                placeholder="Se arma con el nombre si la dejás vacía"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-madre">Dentro de</Label>
              <Select
                id="cat-madre"
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              >
                <option value="">Ninguna (primer nivel)</option>
                {roots
                  .filter((r) => r.id !== form.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Descripción</Label>
              <Textarea
                id="cat-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={2000}
              />
            </div>
            <div className="flex flex-wrap items-end gap-6">
              <div className="space-y-1.5">
                <Label htmlFor="cat-orden">Orden</Label>
                <Input
                  id="cat-orden"
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  className="w-24"
                />
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(isActive) => setForm({ ...form, isActive })}
                label="Activa"
              />
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
