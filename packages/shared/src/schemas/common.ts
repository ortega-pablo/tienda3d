import { z } from 'zod';

export const idSchema = z.string().min(1);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  path: z.string(),
  timestamp: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
