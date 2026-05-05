import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorBody = {
      code: this.codeFor(status),
      message: this.messageFor(exception),
      details: this.detailsFor(exception),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      this.logger.error({ err: exception, path: request.url }, body.message);
    }

    response.status(status).json(body);
  }

  private codeFor(status: number): string {
    return HttpStatus[status] ?? 'UNKNOWN_ERROR';
  }

  private messageFor(exception: unknown): string {
    if (exception instanceof HttpException) {
      const r = exception.getResponse();
      if (typeof r === 'string') return r;
      if (typeof r === 'object' && r !== null && 'message' in r) {
        const m = (r as { message: unknown }).message;
        return Array.isArray(m) ? m.join(', ') : String(m);
      }
    }
    if (exception instanceof Error) return exception.message;
    return 'Unexpected error';
  }

  private detailsFor(exception: unknown): unknown {
    if (exception instanceof HttpException) {
      const r = exception.getResponse();
      if (typeof r === 'object' && r !== null) return r;
    }
    return undefined;
  }
}
