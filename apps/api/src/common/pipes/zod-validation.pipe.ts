import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validación fallida',
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      throw err;
    }
  }
}

/**
 * Inline Zod validator usable as a pipe:
 *   @Body(ZodValidation(loginSchema)) body
 */
export const ZodValidation = <T>(schema: ZodSchema<T>): PipeTransform<unknown, T> =>
  new ZodValidationPipe(schema);
