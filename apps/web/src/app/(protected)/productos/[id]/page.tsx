import { api, ApiError } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { notFound } from 'next/navigation';
import {
  ProductEditor,
  type CategoryLite,
  type ChannelLite,
  type CostingResult,
  type MachineLite,
  type MaterialLite,
  type ProductDto,
} from './product-editor';
import { ProductPrices, type ProductPricesResponse } from './product-prices';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('product:read');
  const { id } = await params;

  let product: ProductDto;
  try {
    product = await api<ProductDto>(`/products/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [materials, cost, prices, channels, machines, categories] = await Promise.all([
    api<MaterialLite[]>('/materials'),
    api<CostingResult>(`/products/${id}/cost`).catch(() => null),
    api<ProductPricesResponse>(`/products/${id}/prices`).catch(() => null),
    api<ChannelLite[]>('/channels'),
    api<MachineLite[]>('/machines'),
    api<CategoryLite[]>('/categories'),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">{product.name}</h1>
        <p className="text-muted-foreground">
          {product.sku ? `SKU ${product.sku} · ` : ''}
          {product.pieces.length} piezas · {product.materials.length} insumos extra
        </p>
      </header>

      <ProductEditor
        mode="edit"
        product={product}
        materials={materials.filter((m) => m.isActive)}
        availableChannels={channels.filter((c) => c.isActive)}
        machines={machines}
        categories={categories}
        initialCost={cost}
      />

      <ProductPrices prices={prices} categoryId={product.categoryId} />
    </div>
  );
}
