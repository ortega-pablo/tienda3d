import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { KeychainTiersController } from './keychain-tiers.controller';
import { KeychainTiersService } from './keychain-tiers.service';

@Module({
  imports: [AuditModule],
  controllers: [KeychainTiersController],
  providers: [KeychainTiersService],
  exports: [KeychainTiersService],
})
export class KeychainTiersModule {}
