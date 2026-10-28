import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Subscription } from 'rxjs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PriceInputsBus } from '@/common/price-inputs/price-inputs.bus';
import { CatalogEvents } from './catalog-events';
import { WebPriceService } from './web-price.service';

/** Espera después del último cambio antes de recalcular: junta las ráfagas de guardados. */
export const RECALC_DEBOUNCE_MS = 2_000;

/** El reloj del debounce, para que los tests lo controlen. */
export interface RecalcTimer {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
export const RECALC_TIMER = Symbol('RECALC_TIMER');
export const realTimer: RecalcTimer = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/**
 * Mantiene al día los precios web (plan F7·2): después de cada cambio en un
 * costo o un markup, cada 10 minutos por las dudas, y cuando el admin lo pide.
 * Son unas decenas de productos, así que se recalculan todos los que están en
 * alguna publicación (también en borrador: publicar exige precio).
 */
@Injectable()
export class WebPriceRecalcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebPriceRecalcService.name);
  private subscription?: Subscription;
  private pending: unknown = null;
  private readonly causes = new Set<string>();
  /** Un recálculo a la vez: dos en paralelo escribirían el historial dos veces. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: WebPriceService,
    private readonly events: CatalogEvents,
    private readonly bus: PriceInputsBus,
    @Inject(RECALC_TIMER) private readonly timer: RecalcTimer,
  ) {}

  onModuleInit(): void {
    this.subscription = this.bus.changes$.subscribe((cause) => this.schedule(cause));
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.pending) this.timer.clearTimeout(this.pending);
  }

  /** Programa un recálculo; otro cambio dentro de la espera lo corre y junta las causas. */
  schedule(cause: string): void {
    this.causes.add(cause);
    if (this.pending) this.timer.clearTimeout(this.pending);
    this.pending = this.timer.setTimeout(() => {
      this.pending = null;
      const causes = [...this.causes].join(', ');
      this.causes.clear();
      // Lo disparó un cambio del sistema: además del precio pudo cambiar lo que se
      // ve (un producto archivado, un color desactivado), así que se avisa todo.
      this.recomputeAll(causes, { wholeCatalog: true }).catch((error: unknown) =>
        this.logger.error({ err: error }, 'No se pudieron recalcular los precios web'),
      );
    }, RECALC_DEBOUNCE_MS);
  }

  @Cron('*/10 * * * *')
  async periodic(): Promise<void> {
    await this.recomputeAll('Recálculo periódico');
  }

  /** Espera a que termine el recálculo en curso (tests y botón del panel). */
  idle(): Promise<unknown> {
    return this.queue;
  }

  recomputeAll(
    cause: string,
    opts: { wholeCatalog?: boolean } = {},
  ): Promise<{ checked: number; changed: number }> {
    const run = this.queue.then(() => this.run(cause, opts.wholeCatalog ?? false));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async run(
    cause: string,
    wholeCatalog: boolean,
  ): Promise<{ checked: number; changed: number }> {
    const members = await this.prisma.webProductMember.findMany({
      where: { isActive: true },
      select: { productId: true, webProduct: { select: { slug: true } } },
    });
    const productIds = [...new Set(members.map((m) => m.productId))];

    const changed = new Set<string>();
    for (const productId of productIds) {
      if ((await this.prices.refresh(productId, cause)).changed) changed.add(productId);
    }

    if (wholeCatalog) {
      await this.prisma.$transaction((tx) =>
        this.events.changed(tx, { scope: 'catalog', ids: [] }),
      );
    } else if (changed.size) {
      const slugs = [
        ...new Set(members.filter((m) => changed.has(m.productId)).map((m) => m.webProduct.slug)),
      ];
      await this.prisma.$transaction((tx) =>
        this.events.changed(tx, { scope: 'product', ids: slugs }),
      );
    }
    if (changed.size) {
      this.logger.log(`Precios web: ${changed.size} de ${productIds.length} cambiaron (${cause})`);
    }
    return { checked: productIds.length, changed: changed.size };
  }
}
