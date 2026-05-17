import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CategoriesModule } from '../categories/categories.module';
import { CostingModule } from '../costing/costing.module';
import { PricingModule } from '../pricing/pricing.module';
import { CustomerCatalogPdfService } from './customer-catalog-pdf.service';
import { CustomerCatalogService } from './customer-catalog.service';
import { CustomerCronService } from './customer-cron.service';
import { CustomerPricingService } from './customer-pricing.service';
import { CustomersController } from './customers.controller';
import { CustomersService, CustomersWriteService } from './customers.service';

@Module({
  imports: [CostingModule, PricingModule, AuditModule, CategoriesModule],
  controllers: [CustomersController],
  providers: [
    CustomersService,
    CustomersWriteService,
    CustomerPricingService,
    CustomerCronService,
    CustomerCatalogService,
    CustomerCatalogPdfService,
  ],
  exports: [
    CustomersService,
    CustomersWriteService,
    CustomerPricingService,
    CustomerCronService,
    CustomerCatalogService,
  ],
})
export class CustomersModule {}
