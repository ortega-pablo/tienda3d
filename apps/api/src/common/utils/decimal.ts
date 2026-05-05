import type { Prisma } from '@prisma/client';

/**
 * Convert a Prisma Decimal (or null/undefined) to a number for API responses.
 * Our domain values fit comfortably in JS Number precision; callers that need
 * exact arithmetic should keep the Decimal on the server.
 */
export function dec(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return value.toNumber();
}

export function decOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return dec(value);
}
