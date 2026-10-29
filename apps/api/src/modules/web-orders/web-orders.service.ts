import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { yearInArgentina } from '@/common/utils/date';
import { DocumentCodeService } from '@/common/utils/document-code';

/**
 * Pedidos de la tienda online en el sistema (plan F14). El código es
 * `W-AAAA-NNNN`, correlativo por año de Argentina y libre de carreras.
 */
@Injectable()
export class WebOrdersService {
  constructor(private readonly codes: DocumentCodeService) {}

  /** El próximo código; dentro de la transacción que crea el pedido. */
  nextCode(tx?: Prisma.TransactionClient, at = new Date()): Promise<string> {
    return this.codes.next('WEB_ORDER', 'W', yearInArgentina(at), 4, tx);
  }
}
