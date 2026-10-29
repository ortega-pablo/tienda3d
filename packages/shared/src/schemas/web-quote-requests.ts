import { z } from 'zod';

/**
 * Solicitudes de personalización de la tienda online en el panel (plan F15·3).
 * La API verifica en compilación que los literales coincidan con Prisma.
 */

/** Nueva → en análisis → cotizada · descartada. El cliente la ve en Mi cuenta (F15·4). */
export const webQuoteRequestStatusSchema = z.enum(['NEW', 'IN_REVIEW', 'QUOTED', 'DISCARDED']);
export type WebQuoteRequestStatusValue = z.infer<typeof webQuoteRequestStatusSchema>;

export const webQuoteRequestListQuerySchema = z.object({
  status: webQuoteRequestStatusSchema.optional(),
});
export type WebQuoteRequestListQuery = z.infer<typeof webQuoteRequestListQuerySchema>;

export const webQuoteRequestUpdateSchema = z
  .object({
    status: webQuoteRequestStatusSchema,
    adminNote: z.string().trim().max(4000),
  })
  .partial()
  .strict()
  .refine((v) => v.status !== undefined || v.adminNote !== undefined, {
    message: 'Nada para cambiar',
  });
export type WebQuoteRequestUpdateInput = z.infer<typeof webQuoteRequestUpdateSchema>;
