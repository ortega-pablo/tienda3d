import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CategoryTiersService } from './category-tiers.service';

@Module({
  imports: [AuditModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoryTiersService],
  exports: [CategoriesService, CategoryTiersService],
})
export class CategoriesModule {}
