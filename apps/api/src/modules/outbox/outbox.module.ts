import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OUTBOX_TARGET, OutboxDispatcher, type OutboxTarget } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';

/** Avisos del sistema al sitio, con entrega garantizada (plan F11·3). */
@Module({
  providers: [
    OutboxService,
    OutboxDispatcher,
    {
      provide: OUTBOX_TARGET,
      inject: [ConfigService],
      useFactory: (config: ConfigService): OutboxTarget => ({
        url: config.getOrThrow<string>('STOREFRONT_EVENTS_URL'),
        secret: config.get<string>('EVENTS_SECRET_T3D_TO_SF') || undefined,
      }),
    },
  ],
  exports: [OutboxService],
})
export class OutboxModule {}
