import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { KeychainDefaultsController } from './keychain-defaults.controller';
import { KeychainDefaultsService } from './keychain-defaults.service';
import { KeychainTiersController } from './keychain-tiers.controller';
import { KeychainTiersService } from './keychain-tiers.service';

@Module({
  imports: [AuditModule],
  controllers: [KeychainTiersController, KeychainDefaultsController],
  providers: [KeychainTiersService, KeychainDefaultsService],
  exports: [KeychainTiersService, KeychainDefaultsService],
})
export class KeychainTiersModule {}
