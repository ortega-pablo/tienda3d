import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryTiersEditor, type CategoryDetailDto, type ChannelLite } from './category-tiers-editor';

interface TiersResolutionDto {
  tiers: Array<{
    id: string;
    minQty: number;
    maxQty: number | null;
    markupPct: number;
    notes: string | null;
  }>;
  source: 'own' | 'inherited' | 'none';
  inheritedFromCategoryId: string | null;
}

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('category:read');
  const { id } = await params;

  let category: CategoryDetailDto;
  try {
    category = await api<CategoryDetailDto>(`/categories/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const channels = await api<ChannelLite[]>('/channels');
  const activeChannels = channels.filter((c) => c.isActive);

  // Cargamos los tiers de cada canal en paralelo. Cada tab arranca con su
  // resolución (tiers + flag de herencia) hidratada desde server.
  const tiersByChannel = Object.fromEntries(
    await Promise.all(
      activeChannels.map(async (ch) => {
        const r = await api<TiersResolutionDto>(
          `/categories/${id}/tiers?channelId=${ch.id}`,
        ).catch(
          (): TiersResolutionDto => ({
            tiers: [],
            source: 'none',
            inheritedFromCategoryId: null,
          }),
        );
        return [ch.id, r] as const;
      }),
    ),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/categorias"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" /> Categorías
        </Link>
        <h1 className="text-3xl font-bold">{category.name}</h1>
        <p className="text-muted-foreground">
          Escalas y markup base de esta categoría. Las subcategorías sin tiers propios para un
          canal heredan los del padre (regla todo-o-nada por canal).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Escalas por canal</CardTitle>
          <CardDescription>
            Cada canal lleva su propia escala. Usá las tabs para alternar. El{' '}
            <strong>markup base</strong> se aplica cuando ninguna escala cubre la cantidad
            (típicamente qty=1).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryTiersEditor
            category={category}
            channels={activeChannels}
            tiersByChannel={tiersByChannel}
          />
        </CardContent>
      </Card>
    </div>
  );
}
