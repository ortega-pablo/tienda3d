import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Idempotencia de lo que pide el sitio (plan F11·4): una clave (eventId o
 * externalId) produce un solo efecto, aunque llegue dos veces o a la vez.
 *
 * La clave se reserva en la misma transacción que el efecto: si el efecto
 * falla no queda reservada y el reintento vuelve a intentarlo; si ya se aplicó,
 * se devuelve la respuesta guardada sin repetir nada.
 */
@Injectable()
export class InboundEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async once<T extends Prisma.InputJsonValue>(
    source: string,
    key: string,
    effect: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<{ result: T; replayed: boolean }> {
    const stored = await this.find<T>(source, key);
    if (stored) return { result: stored, replayed: true };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Reserva primero: una llamada simultánea con la misma clave queda
        // esperando el índice único y después ve la respuesta guardada.
        const claim = await tx.inboundEvent.create({ data: { source, key } });
        const value = await effect(tx);
        await tx.inboundEvent.update({ where: { id: claim.id }, data: { response: value } });
        return value;
      });
      return { result, replayed: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.find<T>(source, key);
        if (winner) return { result: winner, replayed: true };
      }
      throw error;
    }
  }

  private async find<T>(source: string, key: string): Promise<T | null> {
    const row = await this.prisma.inboundEvent.findUnique({
      where: { source_key: { source, key } },
      select: { response: true },
    });
    return row ? (row.response as T) : null;
  }
}
