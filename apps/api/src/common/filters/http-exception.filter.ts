import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ErrorCode } from '../utils/error-codes';

/** Shape returned to the client for every error response. */
interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

interface NormalizedException {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Global exception filter. Normalizes everything (NestJS HttpException, Zod,
 * Prisma errors, raw `Error`) into a consistent `{ code, message, details }`
 * envelope so the frontend can always parse the same shape.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const normalized = this.normalize(exception);

    const body: ErrorBody = {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (normalized.status >= 500) {
      this.logger.error({ err: exception, path: request.url }, body.message);
    } else if (normalized.status >= 400) {
      this.logger.warn({ path: request.url, code: body.code }, body.message);
    }

    response.status(normalized.status).json(body);
  }

  private normalize(exception: unknown): NormalizedException {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION,
        message: 'Validación fallida',
        details: {
          fields: exception.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code,
          })),
        },
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaKnown(exception);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION,
        message: 'Datos inválidos para la operación',
      };
    }
    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode.INTERNAL,
        message: exception.message || 'Error interno',
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL,
      message: 'Error inesperado',
    };
  }

  private fromHttpException(exception: HttpException): NormalizedException {
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const message = this.extractMessage(raw, exception.message);
    const details = typeof raw === 'object' && raw !== null ? raw : undefined;
    return { status, code: this.codeForStatus(status), message, details };
  }

  /** Maps Prisma's documented error codes to HTTP responses we can show. */
  private fromPrismaKnown(exception: Prisma.PrismaClientKnownRequestError): NormalizedException {
    const target = (exception.meta as { target?: string[] | string } | undefined)?.target;
    const targetStr = Array.isArray(target) ? target.join(', ') : target;
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: targetStr
            ? `Ya existe un registro con ${targetStr}`
            : 'Conflicto de unicidad',
          details: { prisma: exception.code, target },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: 'Registro inexistente',
          details: { prisma: exception.code },
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: 'Operación bloqueada por una referencia existente',
          details: { prisma: exception.code, target: exception.meta?.field_name },
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.BAD_REQUEST,
          message: exception.message.split('\n').pop() ?? 'Error de base de datos',
          details: { prisma: exception.code },
        };
    }
  }

  private codeForStatus(status: number): ErrorCode {
    if (status === 400) return ErrorCode.BAD_REQUEST;
    if (status === 401) return ErrorCode.UNAUTHORIZED;
    if (status === 403) return ErrorCode.FORBIDDEN;
    if (status === 404) return ErrorCode.NOT_FOUND;
    if (status === 409) return ErrorCode.CONFLICT;
    if (status === 413) return ErrorCode.PAYLOAD_TOO_LARGE;
    if (status === 422) return ErrorCode.VALIDATION;
    if (status === 429) return ErrorCode.RATE_LIMIT;
    if (status >= 500) return ErrorCode.INTERNAL;
    return ErrorCode.BAD_REQUEST;
  }

  private extractMessage(raw: unknown, fallback: string): string {
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object' && raw !== null && 'message' in raw) {
      const m = (raw as { message: unknown }).message;
      if (Array.isArray(m)) return m.join(', ');
      if (typeof m === 'string') return m;
    }
    return fallback;
  }
}
