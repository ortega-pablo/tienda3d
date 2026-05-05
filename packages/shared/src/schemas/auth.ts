import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const refreshSchema = z.object({
  refreshToken: z.string(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
