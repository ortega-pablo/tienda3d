import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Qué tiene que revalidar el sitio: el catálogo, unas publicaciones (por slug) o los ajustes. */
export type CatalogScope = 'catalog' | 'product' | 'settings';

export interface CatalogChanged {
  scope: CatalogScope;
  ids: string[];
}

/**
 * Aviso `catalog.changed` al sitio (plan §5.5). Se escribe en la misma
 * transacción que el cambio; el outbox que lo entrega llega con F11·3.
 */
export abstract class CatalogEvents {
  abstract changed(tx: Prisma.TransactionClient, event: CatalogChanged): Promise<void>;
}

/** Hasta F11·3 no hay a quién avisarle: el sitio todavía no lee del sistema. */
@Injectable()
export class NoopCatalogEvents extends CatalogEvents {
  changed(): Promise<void> {
    return Promise.resolve();
  }
}
