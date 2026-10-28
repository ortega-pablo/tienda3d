'use client';

import { useState } from 'react';
import type { WebProductDto, WebProductUpdateInput } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { parseRichText, type Inline } from '@/lib/rich-text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { TabProps } from './publication-editor';

type Form = {
  name: string;
  slug: string;
  summary: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  featured: boolean;
};

const toForm = (p: WebProductDto): Form => ({
  name: p.name,
  slug: p.slug,
  summary: p.summary,
  description: p.description,
  seoTitle: p.seoTitle ?? '',
  seoDescription: p.seoDescription ?? '',
  featured: p.featured,
});

/** Solo lo que cambió, con los campos SEO vacíos como null. */
function diff(form: Form, product: WebProductDto): WebProductUpdateInput {
  const before = toForm(product);
  const out: WebProductUpdateInput = {};
  if (form.name !== before.name) out.name = form.name;
  if (form.slug !== before.slug) out.slug = form.slug;
  if (form.summary !== before.summary) out.summary = form.summary;
  if (form.description !== before.description) out.description = form.description;
  if (form.seoTitle !== before.seoTitle) out.seoTitle = form.seoTitle.trim() || null;
  if (form.seoDescription !== before.seoDescription) {
    out.seoDescription = form.seoDescription.trim() || null;
  }
  if (form.featured !== before.featured) out.featured = form.featured;
  return out;
}

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'strong' ? (
          <strong key={i}>{p.text}</strong>
        ) : p.kind === 'em' ? (
          <em key={i}>{p.text}</em>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Lo que va a mostrar la ficha del sitio. */
function Preview({ text }: { text: string }) {
  const blocks = parseRichText(text);
  if (!blocks.length) return <p className="text-sm text-muted-foreground">Sin descripción.</p>;
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((b, i) =>
        b.kind === 'list' ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>
                <InlineText parts={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <InlineText parts={line} />
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

export function ContentTab({ product, run, canWrite }: TabProps) {
  const [form, setForm] = useState<Form>(() => toForm(product));
  const changes = diff(form, product);
  const dirty = Object.keys(changes).length > 0;
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () =>
    run(
      () =>
        api<WebProductDto>(`/web-catalog/products/${product.id}`, {
          method: 'PATCH',
          body: changes,
        }),
      'Contenido guardado',
    );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Ficha</CardTitle>
          <CardDescription>
            Cambiar la dirección (slug) deja la vieja redirigiendo a la nueva.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-nombre">Nombre</Label>
            <Input
              id="c-nombre"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              disabled={!canWrite}
              maxLength={160}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-slug">Dirección (slug)</Label>
            <Input
              id="c-slug"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
              disabled={!canWrite}
              maxLength={120}
            />
            {product.previousSlugs.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Redirigen acá: {product.previousSlugs.join(', ')}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-resumen">Resumen</Label>
            <Textarea
              id="c-resumen"
              rows={2}
              value={form.summary}
              onChange={(e) => set('summary', e.target.value)}
              disabled={!canWrite}
              maxLength={500}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-descripcion">Descripción</Label>
            <Textarea
              id="c-descripcion"
              rows={8}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              disabled={!canWrite}
              maxLength={10000}
            />
            <p className="text-xs text-muted-foreground">
              Párrafos separados por una línea en blanco, **negrita**, *itálica* y listas con
              &quot;- &quot; al principio de cada línea.
            </p>
          </div>
          <Switch
            checked={form.featured}
            onCheckedChange={(v) => set('featured', v)}
            disabled={!canWrite}
            label="Destacada en la portada"
          />
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Vista previa de la descripción</CardTitle>
          </CardHeader>
          <CardContent>
            <Preview text={form.description} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Buscadores (SEO)</CardTitle>
            <CardDescription>Si quedan vacíos, se usan el nombre y el resumen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-seo-titulo">Título ({form.seoTitle.length}/70)</Label>
              <Input
                id="c-seo-titulo"
                value={form.seoTitle}
                onChange={(e) => set('seoTitle', e.target.value)}
                disabled={!canWrite}
                maxLength={70}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-seo-desc">Descripción ({form.seoDescription.length}/160)</Label>
              <Textarea
                id="c-seo-desc"
                rows={3}
                value={form.seoDescription}
                onChange={(e) => set('seoDescription', e.target.value)}
                disabled={!canWrite}
                maxLength={160}
              />
            </div>
          </CardContent>
        </Card>
        {canWrite && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={!dirty} onClick={() => setForm(toForm(product))}>
              Descartar
            </Button>
            <Button disabled={!dirty} onClick={save}>
              Guardar contenido
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
