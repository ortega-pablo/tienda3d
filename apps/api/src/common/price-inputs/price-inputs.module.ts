import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PriceInputsBus } from './price-inputs.bus';
import { PriceInputsInterceptor } from './price-inputs.interceptor';

/** Avisos de cambios en lo que define los precios (plan F7·2). */
@Global()
@Module({
  providers: [PriceInputsBus, { provide: APP_INTERCEPTOR, useClass: PriceInputsInterceptor }],
  exports: [PriceInputsBus],
})
export class PriceInputsModule {}
