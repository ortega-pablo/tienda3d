import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/** Archivos en los volúmenes `media` y `private` (plan F6·1). */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
