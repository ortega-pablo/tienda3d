import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AFFECTS_PRICES } from './affects-prices.decorator';
import { PriceInputsBus } from './price-inputs.bus';

/** Avisa al bus después de una escritura marcada con `@AffectsPrices` que salió bien. */
@Injectable()
export class PriceInputsInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly bus: PriceInputsBus,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const cause = this.reflector.get<string | undefined>(AFFECTS_PRICES, context.getHandler());
    if (!cause) return next.handle();
    // La transacción del handler ya se confirmó cuando la respuesta sale.
    return next.handle().pipe(tap({ complete: () => this.bus.changed(cause) }));
  }
}
