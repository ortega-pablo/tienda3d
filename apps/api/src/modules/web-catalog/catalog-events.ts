import { Injectable } from '@nestjs/common';
import { Prisma, WebProductStatus } from '@prisma/client';
import { OutboxService } from '@/modules/outbox/outbox.service';

/** Qué tiene que revalidar el sitio: el catálogo, unas publicaciones (por slug) o los ajustes. */
export type CatalogScope = 'catalog' | 'product' | 'settings';

export interface CatalogChanged {
  scope: CatalogScope;
  ids: string[];
}

/**
 * Aviso `catalog.changed` al sitio (plan §5.5). Se escribe en la misma
 * transacción que el cambio, en el outbox (F11·3), que lo entrega firmado.
 */
export abstract class CatalogEvents {
  abstract changed(tx: Prisma.TransactionClient, event: CatalogChanged): Promise<void>;

  /**
   * Cambió algo de una publicación. Solo avisa si está publicada: lo demás el
   * sitio no lo ve. `alsoSlugs` suma, por ejemplo, el slug viejo si cambió.
   */
  async productChanged(
    tx: Prisma.TransactionClient,
    webProductId: string,
    alsoSlugs: string[] = [],
  ): Promise<void> {
    const product = await tx.webProduct.findUnique({
      where: { id: webProductId },
      select: { slug: true, status: true },
    });
    if (product?.status !== WebProductStatus.PUBLISHED) return;
    await this.changed(tx, { scope: 'product', ids: [...new Set([product.slug, ...alsoSlugs])] });
  }
}

/** Escribe el aviso en el outbox, dentro de la transacción del cambio. */
@Injectable()
export class OutboxCatalogEvents extends CatalogEvents {
  constructor(private readonly outbox: OutboxService) {
    super();
  }

  changed(tx: Prisma.TransactionClient, event: CatalogChanged): Promise<void> {
    return this.outbox.enqueue(tx, 'catalog.changed', { scope: event.scope, ids: event.ids });
  }
}
