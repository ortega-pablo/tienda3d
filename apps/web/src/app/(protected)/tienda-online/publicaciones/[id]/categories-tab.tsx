'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { WebCategoryDto, WebProductDto } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import type { TabProps } from './publication-editor';

export function CategoriesTab({
  product,
  run,
  canWrite,
  categories,
}: TabProps & { categories: WebCategoryDto[] }) {
  const [selected, setSelected] = useState(() => new Set(product.categories.map((c) => c.id)));
  const roots = categories.filter((c) => c.parentId === null);
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id);
  const dirty =
    selected.size !== product.categories.length ||
    product.categories.some((c) => !selected.has(c.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const box = (c: WebCategoryDto) => (
    <Checkbox
      checked={selected.has(c.id)}
      disabled={!canWrite}
      onChange={(e) => toggle(c.id, e.target.checked)}
      label={c.isActive ? c.name : `${c.name} (inactiva)`}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorías de la tienda</CardTitle>
        <CardDescription>
          Ordenan la vidriera; no cambian ningún precio (esos dependen de la categoría del sistema).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {roots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay categorías de la tienda. Se crean en{' '}
            <Link href="/tienda-online/categorias" className="underline">
              Categorías de la tienda
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {roots.map((root) => (
              <li key={root.id} className="space-y-2">
                {box(root)}
                {childrenOf(root.id).length > 0 && (
                  <ul className="space-y-2 pl-6">
                    {childrenOf(root.id).map((child) => (
                      <li key={child.id}>{box(child)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && roots.length > 0 && (
          <div className="flex justify-end">
            <Button
              disabled={!dirty}
              onClick={() =>
                run(
                  () =>
                    api<WebProductDto>(`/web-catalog/products/${product.id}/categories`, {
                      method: 'PUT',
                      body: { categoryIds: [...selected] },
                    }),
                  'Categorías guardadas',
                )
              }
            >
              Guardar categorías
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
