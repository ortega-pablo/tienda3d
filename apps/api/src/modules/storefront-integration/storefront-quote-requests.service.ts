import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { AuditService } from '@/modules/audit/audit.service';
import { webCustomerSchema, WebCustomersService } from './web-customers.service';

/** Las mismas reglas que el formulario del sitio (`domain/quotes.ts`). */
export const QUOTE_ATTACHMENT = {
  maxBytes: 20 * 1024 * 1024,
  extensions: ['stl', '3mf', 'obj', 'step', 'stp', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'pdf'],
} as const;

/** Lo que manda el sitio de una solicitud (F15·2), en el campo `data` del multipart. */
export const webQuoteRequestSchema = z.object({
  externalId: z.string().min(1).max(64),
  customer: webCustomerSchema,
  idea: z.string().trim().min(10).max(5000),
  requestedAt: z.coerce.date(),
});
export type WebQuoteRequestInput = z.infer<typeof webQuoteRequestSchema>;

export interface ReceivedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface QuoteRequestReceived {
  id: string;
  replayed: boolean;
}

/** Extensión admitida del nombre del archivo, o null. */
export function attachmentExtension(name: string): string | null {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  return (QUOTE_ATTACHMENT.extensions as readonly string[]).includes(ext) ? ext : null;
}

/**
 * Las solicitudes de personalización del sitio (plan F15·2): quedan vinculadas
 * al cliente (F13·8) y su archivo en el volumen privado, que no sale nunca del
 * sistema. Idempotente por el id de la solicitud en el sitio.
 */
@Injectable()
export class StorefrontQuoteRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly customers: WebCustomersService,
    private readonly audit: AuditService,
  ) {}

  async receive(
    input: WebQuoteRequestInput,
    file: ReceivedFile | null,
  ): Promise<QuoteRequestReceived> {
    const existing = await this.find(input.externalId);
    if (existing) return existing;

    let ext: string | null = null;
    if (file) {
      ext = attachmentExtension(file.originalname);
      if (!ext) {
        throw new UnprocessableEntityException({
          message: 'Formato de archivo no admitido.',
          reason: 'INVALID_ATTACHMENT',
        });
      }
      if (file.size > QUOTE_ATTACHMENT.maxBytes) {
        throw new UnprocessableEntityException({
          message: 'El archivo supera los 20 MB.',
          reason: 'INVALID_ATTACHMENT',
        });
      }
    }

    const path =
      file && ext ? await this.storage.save('private', 'quote-requests', ext, file.buffer) : null;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const { customerId } = await this.customers.apply(tx, input.customer);
        return tx.webQuoteRequest.create({
          data: {
            externalId: input.externalId,
            customerId,
            name: `${input.customer.firstName} ${input.customer.lastName}`.trim(),
            email: input.customer.email,
            phone: input.customer.phone || null,
            idea: input.idea,
            requestedAt: input.requestedAt,
            ...(file && {
              attachmentPath: path,
              attachmentName: file.originalname.slice(0, 200),
              attachmentType: file.mimetype.slice(0, 100),
              attachmentSize: file.size,
            }),
          },
          select: { id: true },
        });
      });
      await this.audit.record({
        actorId: null,
        entity: 'WebQuoteRequest',
        entityId: created.id,
        action: 'received',
        after: { externalId: input.externalId, attachment: file?.originalname ?? null },
      });
      return { id: created.id, replayed: false };
    } catch (error) {
      if (path) await this.storage.delete('private', path);
      // Dos entregas simultáneas de la misma solicitud: la segunda ve la primera.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.find(input.externalId);
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async find(externalId: string): Promise<QuoteRequestReceived | null> {
    const found = await this.prisma.webQuoteRequest.findUnique({
      where: { externalId },
      select: { id: true },
    });
    return found ? { id: found.id, replayed: true } : null;
  }
}
