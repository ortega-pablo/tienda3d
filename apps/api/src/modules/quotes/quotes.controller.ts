import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { QuoteStatus, QuoteType } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import {
  adhocCostSchema,
  keychainMatrixSchema,
  quoteCreateSchema as createSchema,
  quoteListQuerySchema as listQuerySchema,
  quotePreviewSchema as previewSchema,
  quoteStatusUpdateSchema as statusSchema,
  type QuoteStatusValue,
  type QuoteTypeValue,
} from '@tienda3d/shared';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { CostingService } from '../costing/costing.service';
import { PdfService } from './pdf.service';
import { QuotesService } from './quotes.service';

/**
 * Los schemas de request viven en `@tienda3d/shared` para que la API y los
 * formularios de web validen el MISMO contrato. Antes estaban acá y web
 * re-declaraba a mano la forma de cada payload: agregar un campo no producía
 * ningún error del otro lado.
 */

/**
 * Verificación en tiempo de compilación: los literales del schema compartido
 * tienen que cubrir exactamente los enums de Prisma. `shared` no puede importar
 * `@prisma/client` (lo consume también el bundle del navegador), así que ésta
 * es la costura donde se comprueba que no se separaron. Si alguien agrega un
 * QuoteStatus en el schema y no en shared —o al revés— esto no compila.
 */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _statusMatchesPrisma: AssertEqual<QuoteStatusValue, QuoteStatus> = true;
const _typeMatchesPrisma: AssertEqual<QuoteTypeValue, QuoteType> = true;
void _statusMatchesPrisma;
void _typeMatchesPrisma;

@UseGuards(PermissionsGuard)
@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly pdf: PdfService,
    private readonly costing: CostingService,
  ) {}

  @Permissions('quote:read')
  @Get()
  list(@Query(ZodValidation(listQuerySchema)) query: z.infer<typeof listQuerySchema>) {
    return this.quotes.list(query);
  }

  @Permissions('quote:read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AccessPayload) {
    // El desglose de cálculo solo se expone a admins (permiso parameter:read).
    return this.quotes.get(id, user.permissions.includes('parameter:read'));
  }

  @Permissions('quote:create')
  @Post()
  create(
    @Body(ZodValidation(createSchema)) body: z.infer<typeof createSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    // customerName puede venir vacío si vino customerId; el service completa
    // del Customer. Si no hay ninguno de los dos, falla en el service.
    return this.quotes.create({ ...body, customerName: body.customerName ?? '' }, user.sub);
  }

  @Permissions('quote:create')
  @Post('preview-item')
  preview(@Body(ZodValidation(previewSchema)) body: z.infer<typeof previewSchema>) {
    return this.quotes.previewItem(body.item, body.channelId, body.customerId ?? null);
  }

  @Permissions('quote:create')
  @Post('adhoc-cost')
  adhocCost(@Body(ZodValidation(adhocCostSchema)) body: z.infer<typeof adhocCostSchema>) {
    return this.costing.forAdhoc(body.payload);
  }

  /**
   * Devuelve el precio unitario y total para cada tier de llaveros, con el
   * mismo payload (materiales/minutos). Se usa para la tabla comparativa de
   * `/cotizaciones/nueva-llaveros`: el vendedor ve el incentivo de saltar de
   * tier sin tener que cambiar la cantidad y recalcular una por una.
   */
  @Permissions('quote:create')
  @Post('keychain-matrix')
  keychainMatrix(
    @Body(ZodValidation(keychainMatrixSchema)) body: z.infer<typeof keychainMatrixSchema>,
  ) {
    return this.quotes.keychainMatrix(body);
  }

  // Cambiar el estado NO es una lectura: pasar a ACCEPTED dispara la imputación
  // de volúmenes mensuales, que alimenta las suspensiones automáticas del cierre
  // de mes. Con `quote:read` el rol viewer podía cerrar ventas.
  @Permissions('quote:create')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body(ZodValidation(statusSchema)) body: z.infer<typeof statusSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.quotes.setStatus(id, body.status, user.sub);
  }

  @Permissions('quote:create')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AccessPayload): Promise<void> {
    await this.quotes.remove(id, user.sub);
  }

  @Permissions('quote:export')
  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const quote = await this.quotes.get(id);
    const buffer = await this.pdf.generateQuotePdf(quote);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.code}.pdf"`);
    res.send(buffer);
  }
}
