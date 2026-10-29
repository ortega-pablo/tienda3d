import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import {
  webQuoteRequestListQuerySchema,
  webQuoteRequestUpdateSchema,
  type WebQuoteRequestCountDto,
  type WebQuoteRequestListQuery,
  type WebQuoteRequestUpdateInput,
} from '@tienda3d/shared';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { WebQuoteRequestsService } from './web-quote-requests.service';

/** Solicitudes de personalización en el panel (F15·3): datos del cliente, `ecommerce:orders`. */
@UseGuards(PermissionsGuard)
@Controller('web-quote-requests')
export class WebQuoteRequestsController {
  constructor(private readonly requests: WebQuoteRequestsService) {}

  @Permissions('ecommerce:orders')
  @Get()
  list(@Query(ZodValidation(webQuoteRequestListQuerySchema)) query: WebQuoteRequestListQuery) {
    return this.requests.list(query);
  }

  @Permissions('ecommerce:orders')
  @Get('new-count')
  async newCount(): Promise<WebQuoteRequestCountDto> {
    return { count: await this.requests.newCount() };
  }

  @Permissions('ecommerce:orders')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.requests.get(id);
  }

  @Permissions('ecommerce:orders')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(webQuoteRequestUpdateSchema)) body: WebQuoteRequestUpdateInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.requests.update(id, body, user.sub);
  }

  /** El archivo que mandó el cliente: siempre como descarga, nunca se muestra en el panel. */
  @Permissions('ecommerce:orders')
  @Get(':id/attachment')
  async attachment(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.requests.attachment(id);
    res.set({
      'Content-Type': file.type,
      'Content-Disposition': `attachment; filename="${file.name.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(file.path));
  }
}
