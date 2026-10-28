import type { SystemProductWebDto } from '@tienda3d/shared';
import { api, ApiError } from '@/lib/api-server';
import { hasPermission, requirePermission } from '@/lib/auth';
import { notFound } from 'next/navigation';
import {
  ProductEditor,
  type CategoryLite,
  type ChannelLite,
  type CostingResult,
  type KeychainCosts,
  type MachineLite,
  type MaterialLite,
  type ProductDto,
} from './product-editor';
import { ProductPrices, type ProductPricesResponse } from './product-prices';
import { ProductWebSection } from './product-web-section';

/** Dirección pública de la tienda, para el link "Ver en la tienda". */
const STORE_URL = process.env.STORE_PUBLIC_URL ?? 'http://tienda.localhost';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('product:read');
  const seesStore = hasPermission(user, 'ecommerce:read');
  const { id } = await params;

  let product: ProductDto;
  try {
    product = await api<ProductDto>(`/products/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const isKeychain = product.kind === 'KEYCHAIN';
  const [materials, cost, keychainCosts, prices, channels, machines, categories] =
    await Promise.all([
      api<MaterialLite[]>('/materials'),
      // Producto estándar: costo único. Llavero: dos bases (individual + tanda).
      isKeychain
        ? Promise.resolve(null)
        : api<CostingResult>(`/products/${id}/cost`).catch(() => null),
      isKeychain
        ? api<KeychainCosts>(`/products/${id}/keychain-costs`).catch(() => null)
        : Promise.resolve(null),
      api<ProductPricesResponse>(`/products/${id}/prices`).catch(() => null),
      api<ChannelLite[]>('/channels'),
      api<MachineLite[]>('/machines'),
      api<CategoryLite[]>('/categories'),
    ]);
  const web = seesStore
    ? await api<SystemProductWebDto>(`/web-catalog/by-product/${id}`).catch(() => null)
    : null;

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
        keychainCosts={keychainCosts}
      />

      <ProductPrices prices={prices} categoryId={product.categoryId} kind={product.kind} />

      {web && (
        <ProductWebSection
          productId={product.id}
          productName={product.name}
          productDescription={product.description ?? null}
          web={web}
          storeUrl={STORE_URL}
          canWrite={hasPermission(user, 'ecommerce:write')}
        />
      )}
    </div>
  );
}
