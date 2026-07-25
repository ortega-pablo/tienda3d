import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { KeychainDefaultsController } from './keychain-defaults.controller';
import { KeychainDefaultsService } from './keychain-defaults.service';

/**
 * Valores precargados del form de cotización de llaveros (singleton
 * `KeychainDefaults`). La grilla de escalas de llavero se unificó en
 * `KeychainScaleTiersModule` (grilla contigua compartida por catálogo y
 * cotizador); la grilla vieja `KeychainTier` fue retirada.
 */
@Module({
  imports: [AuditModule],
  controllers: [KeychainDefaultsController],
  providers: [KeychainDefaultsService],
  exports: [KeychainDefaultsService],
})
export class KeychainTiersModule {}
