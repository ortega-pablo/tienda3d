import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { KeychainScaleTiersController } from './keychain-scale-tiers.controller';
import { KeychainScaleTiersService } from './keychain-scale-tiers.service';

@Module({
  imports: [AuditModule],
  controllers: [KeychainScaleTiersController],
  providers: [KeychainScaleTiersService],
  exports: [KeychainScaleTiersService],
})
export class KeychainScaleTiersModule {}
