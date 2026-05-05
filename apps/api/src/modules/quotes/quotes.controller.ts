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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { CostingService } from '../costing/costing.service';
import { PdfService } from './pdf.service';
import { QuotesService } from './quotes.service';

const adhocPayloadSchema = z.object({
  pieces: z.array(
    z.object({
      name: z.string().min(1).max(120),
      grams: z.number().nonnegative(),
      printMinutes: z.number().nonnegative(),
      filamentId: z.string().min(1),
    }),
  ),
  materials: z.array(
    z.object({
      materialId: z.string().min(1),
      quantity: z.number().positive(),
    }),
  ),
  assemblyMinutes: z.number().nonnegative(),
  managementMinutes: z.number().nonnegative(),
});

const productItemSchema = z.object({
  type: z.literal('PRODUCT'),
  productId: z.string().min(1),
  quantity: z.number().positive(),
  description: z.string().max(240).optional(),
});
const adhocItemSchema = z.object({
  type: z.literal('ADHOC'),
  description: z.string().min(1).max(240),
  quantity: z.number().positive(),
  payload: adhocPayloadSchema,
});

const itemSchema = z.discriminatedUnion('type', [productItemSchema, adhocItemSchema]);

const createSchema = z.object({
  customerName: z.string().min(1).max(160),
  customerEmail: z.string().email().nullable().optional(),
  customerPhone: z.string().max(40).nullable().optional(),
  customerNotes: z.string().max(2000).nullable().optional(),
  channelId: z.string().min(1).nullable(),
  withInvoice: z.boolean().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  discount: z.number().min(0).optional(),
  items: z.array(itemSchema).min(1),
});

const previewSchema = z.object({
  channelId: z.string().nullable(),
  item: itemSchema,
});

const statusSchema = z.object({
  status: z.nativeEnum(QuoteStatus),
});

const listQuerySchema = z.object({
  type: z.nativeEnum(QuoteType).optional(),
});

const adhocCostSchema = z.object({
  channelId: z.string().nullable().optional(),
  payload: adhocPayloadSchema,
});

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
  get(@Param('id') id: string) {
    return this.quotes.get(id);
  }

  @Permissions('quote:create')
  @Post()
  create(
    @Body(ZodValidation(createSchema)) body: z.infer<typeof createSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.quotes.create(body, user.sub);
  }

  @Permissions('quote:create')
  @Post('preview-item')
  preview(@Body(ZodValidation(previewSchema)) body: z.infer<typeof previewSchema>) {
    return this.quotes.previewItem(body.item, body.channelId);
  }

  @Permissions('quote:create')
  @Post('adhoc-cost')
  adhocCost(@Body(ZodValidation(adhocCostSchema)) body: z.infer<typeof adhocCostSchema>) {
    return this.costing.forAdhoc(body.payload);
  }

  @Permissions('quote:read')
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
  async remove(@Param('id') id: string): Promise<void> {
    await this.quotes.remove(id);
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
