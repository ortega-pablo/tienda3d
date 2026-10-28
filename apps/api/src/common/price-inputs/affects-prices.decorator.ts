import { SetMetadata } from '@nestjs/common';

export const AFFECTS_PRICES = 'affectsPrices';

/**
 * Marca una escritura que cambia el precio de algún producto (plan §4.3).
 * Si el handler termina bien, se recalculan los precios web (F7·2).
 */
export const AffectsPrices = (cause: string) => SetMetadata(AFFECTS_PRICES, cause);
