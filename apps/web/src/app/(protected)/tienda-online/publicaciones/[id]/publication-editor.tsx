'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import type {
  WebCategoryDto,
  WebPriceDto,
  WebProductDto,
  WebPublishChecklistDto,
} from '@tienda3d/shared';
import { handleApiError } from '@/lib/handle-error';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { STATUS_LABEL } from '../../web-labels';
import { CategoriesTab } from './categories-tab';
import { ContentTab } from './content-tab';
import { PhotosTab } from './photos-tab';
import { PublicationTab } from './publication-tab';
import { VariantsTab } from './variants-tab';

/** Producto del sistema, como lo lista `GET /products`. */
export interface SystemProduct {
  id: string;
  name: string;
  sku: string | null;
  isActive: boolean;
}

/** Línea de filamento con sus colores (`GET /materials?type=FILAMENT`). */
export interface FilamentLine {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  children: Array<{
    id: string;
    name: string;
    color: string | null;
    colorHex: string | null;
    isActive: boolean;
  }>;
}

/** Piezas de un miembro (`GET /products/:id`), para elegir qué pinta cada color. */
export interface MemberPieces {
  id: string;
  name: string;
  pieces: Array<{ id: string; name: string; defaultFilamentId: string | null }>;
}

/** Corre una escritura: actualiza la publicación, avisa y refresca checklist y precios. */
export type RunMutation = (
  action: () => Promise<WebProductDto>,
  success: string,
) => Promise<boolean>;

export function PublicationEditor({
  initialProduct,
  initialChecklist,
  prices,
  memberPieces,
  systemProducts,
  lines,
  categories,
  storeUrl,
  canWrite,
}: {
  initialProduct: WebProductDto;
  initialChecklist: WebPublishChecklistDto;
  prices: WebPriceDto[];
  memberPieces: MemberPieces[];
  systemProducts: SystemProduct[];
  lines: FilamentLine[];
  categories: WebCategoryDto[];
  storeUrl: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [tab, setTab] = useState('contenido');
  const [busy, setBusy] = useState(false);

  const run: RunMutation = useCallback(
    async (action, success) => {
      setBusy(true);
      try {
        setProduct(await action());
        toast.success(success);
        // Checklist, precios y piezas vienen del servidor.
        router.refresh();
        return true;
      } catch (err) {
        handleApiError(err);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const status = STATUS_LABEL[product.status];
  const shared = { product, run, busy, canWrite: canWrite && !busy };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/tienda-online/publicaciones"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Publicaciones
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-muted-foreground">
          /producto/{product.slug} · {product.members.length} producto(s) del sistema ·{' '}
          {product.variants.filter((v) => v.isActive).length} variante(s) activa(s)
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Secciones de la publicación">
          <TabsTrigger value="contenido">Contenido</TabsTrigger>
          <TabsTrigger value="variantes">Variantes</TabsTrigger>
          <TabsTrigger value="fotos">Fotos ({product.images.length})</TabsTrigger>
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
          <TabsTrigger value="publicacion">Publicación</TabsTrigger>
        </TabsList>
        <TabsContent value="contenido">
          <ContentTab {...shared} />
        </TabsContent>
        <TabsContent value="variantes">
          <VariantsTab
            {...shared}
            systemProducts={systemProducts}
            lines={lines}
            memberPieces={memberPieces}
          />
        </TabsContent>
        <TabsContent value="fotos">
          <PhotosTab {...shared} />
        </TabsContent>
        <TabsContent value="categorias">
          <CategoriesTab {...shared} categories={categories} />
        </TabsContent>
        <TabsContent value="publicacion">
          <PublicationTab
            {...shared}
            checklist={initialChecklist}
            prices={prices}
            storeUrl={storeUrl}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export interface TabProps {
  product: WebProductDto;
  run: RunMutation;
  busy: boolean;
  canWrite: boolean;
}
