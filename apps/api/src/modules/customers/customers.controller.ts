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
import { CustomerType } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import { CustomerCatalogPdfService } from './customer-catalog-pdf.service';
import { CustomerCatalogService } from './customer-catalog.service';
import { CustomerCronService } from './customer-cron.service';
import { CustomerPricingService } from './customer-pricing.service';
import { CustomersService, CustomersWriteService } from './customers.service';

const listQuerySchema = z.object({
  activeOnly: z.coerce.boolean().optional(),
  type: z.nativeEnum(CustomerType).optional(),
});

const customerInputSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.nativeEnum(CustomerType).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  taxId: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  skipChannelCommission: z.boolean().optional(),
  skipMarketing: z.boolean().optional(),
  skipRegime: z.boolean().optional(),
  skipReinvestment: z.boolean().optional(),
  hasPortalAccess: z.boolean().optional(),
});

const customerUpdateSchema = customerInputSchema.partial();

const commitmentInputSchema = z.object({
  categoryId: z.string().min(1),
  minTierQty: z.number().int().min(1).nullable().optional(),
  monthlyCommitmentQty: z.number().int().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const productOverrideSchema = z.object({
  productId: z.string().min(1),
  customMarkupPct: z.number().min(0).max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const suspensionInputSchema = z.object({
  suspend: z.boolean(),
});

@UseGuards(PermissionsGuard)
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly write: CustomersWriteService,
    private readonly customerPricing: CustomerPricingService,
    private readonly cron: CustomerCronService,
    private readonly catalog: CustomerCatalogService,
    private readonly catalogPdf: CustomerCatalogPdfService,
  ) {}

  // ---------- Lectura ----------

  @Permissions('customer:read')
  @Get()
  list(@Query(ZodValidation(listQuerySchema)) query: z.infer<typeof listQuerySchema>) {
    return this.customers.list(query);
  }

  @Permissions('customer:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.getWithRelations(id);
  }

  @Permissions('customer:read')
  @Get(':id/products/:productId/prices')
  productPrices(@Param('id') id: string, @Param('productId') productId: string) {
    return this.customerPricing.forCustomerProduct(id, productId);
  }

  @Permissions('customer:read')
  @Get(':id/quotes')
  quotes(@Param('id') id: string) {
    return this.customers.listQuotes(id);
  }

  @Permissions('customer:read')
  @Get(':id/volumes')
  volumes(@Param('id') id: string) {
    return this.customers.listVolumes(id);
  }

  @Permissions('customer:read')
  @Get(':id/catalog')
  catalogJson(@Param('id') id: string) {
    return this.catalog.forCustomer(id);
  }

  @Permissions('customer:read')
  @Get(':id/catalog.pdf')
  async catalogPdfDownload(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.catalog.forCustomer(id);
    const buffer = await this.catalogPdf.render(data);
    const safeName = data.customerName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="catalogo-${safeName}.pdf"`,
    );
    res.send(buffer);
  }

  /**
   * Endpoint manual para correr el cierre mensual. El cron lo ejecuta solo
   * automáticamente; este endpoint sirve para testing y para correr el cierre
   * manualmente si el cron falla.
   *
   * Acepta opcionalmente `?asOf=YYYY-MM-DD` para simular una fecha distinta.
   * Permiso: solo admin (`customer:write` ya es suficientemente restrictivo).
   */
  @Permissions('customer:write')
  @Post('cron/monthly-close')
  runMonthlyClose(@Query('asOf') asOf?: string) {
    const referenceDate = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(referenceDate.getTime())) {
      throw new Error('asOf debe ser una fecha válida (YYYY-MM-DD).');
    }
    return this.cron.runMonthlyClose(referenceDate);
  }

  // ---------- Escritura: Customer ----------

  @Permissions('customer:write')
  @Post()
  async create(
    @Body(ZodValidation(customerInputSchema)) body: z.infer<typeof customerInputSchema>,
  ) {
    const { id } = await this.write.create(body);
    return this.customers.getWithRelations(id);
  }

  @Permissions('customer:write')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(ZodValidation(customerUpdateSchema)) body: z.infer<typeof customerUpdateSchema>,
  ) {
    await this.write.update(id, body);
    return this.customers.getWithRelations(id);
  }

  @Permissions('customer:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.write.remove(id);
  }

  // ---------- Escritura: commitments ----------

  @Permissions('customer:write')
  @Post(':id/commitments')
  async upsertCommitment(
    @Param('id') id: string,
    @Body(ZodValidation(commitmentInputSchema)) body: z.infer<typeof commitmentInputSchema>,
  ) {
    await this.write.upsertCommitment(id, body);
    return this.customers.getWithRelations(id);
  }

  @Permissions('customer:write')
  @Delete(':id/commitments/:commitmentId')
  @HttpCode(204)
  async removeCommitment(
    @Param('id') id: string,
    @Param('commitmentId') commitmentId: string,
  ): Promise<void> {
    await this.write.removeCommitment(id, commitmentId);
  }

  @Permissions('customer:write')
  @Patch(':id/commitments/:commitmentId/suspension')
  async toggleSuspension(
    @Param('id') id: string,
    @Param('commitmentId') commitmentId: string,
    @Body(ZodValidation(suspensionInputSchema)) body: z.infer<typeof suspensionInputSchema>,
  ) {
    await this.write.toggleSuspension(id, commitmentId, body.suspend);
    return this.customers.getWithRelations(id);
  }

  // ---------- Escritura: productos asignados (SPECIAL) ----------

  @Permissions('customer:write')
  @Post(':id/products')
  async upsertProduct(
    @Param('id') id: string,
    @Body(ZodValidation(productOverrideSchema)) body: z.infer<typeof productOverrideSchema>,
  ) {
    await this.write.upsertProduct(id, body);
    return this.customers.getWithRelations(id);
  }

  @Permissions('customer:write')
  @Delete(':id/products/:productId')
  @HttpCode(204)
  async removeProduct(
    @Param('id') id: string,
    @Param('productId') productId: string,
  ): Promise<void> {
    await this.write.removeProduct(id, productId);
  }
}
