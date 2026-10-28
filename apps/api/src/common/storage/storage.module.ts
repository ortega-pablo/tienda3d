import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_ROOTS, StorageService, type StorageRoots } from './storage.service';

/** Archivos en los volúmenes `media` y `private` (plan F6·1). */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_ROOTS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageRoots => ({
        media: config.getOrThrow<string>('MEDIA_DIR'),
        private: config.getOrThrow<string>('PRIVATE_DIR'),
      }),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
