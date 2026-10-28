import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, type TestingModule } from '@nestjs/testing';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { verifyEvent } from '@/common/integration-auth/event-signature';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppModule } from '@/app.module';
import { WebProductsService } from '@/modules/web-catalog/web-products.service';
import { WebPublicationService } from '@/modules/web-catalog/web-publication.service';
import { WebSettingsService } from '@/modules/web-catalog/web-settings.service';
import { WebVariantsService } from '@/modules/web-catalog/web-variants.service';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';
import {
  GIVE_UP_AFTER_MS,
  OUTBOX_TARGET,
  OutboxDispatcher,
  retryDelayMs,
  type OutboxTarget,
} from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';

const SECRET = 's'.repeat(40);

/** El receptor del sitio: se prende y se apaga, y guarda lo que recibe. */
class FakeStorefront {
  server: Server | null = null;
  received: Array<{ headers: IncomingHttpHeaders; body: string }> = [];
  status = 200;
  port = 0;

  async start(port = 0): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        this.received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        res.statusCode = this.status;
        res.end();
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve));
    this.port = (this.server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }
}

/**
 * F11·3: los avisos al sitio se escriben con el cambio y se reintentan hasta
 * llegar. El reloj se pasa a mano para no esperar los backoffs.
 */
describe('[int] Outbox de avisos al sitio', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let dispatcher: OutboxDispatcher;
  let fx: Fixtures;
  let soon: jest.SpyInstance;
  const target: OutboxTarget = { url: '', secret: SECRET };
  const storefront = new FakeStorefront();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OUTBOX_TARGET)
      .useValue(target)
      .compile();
    await moduleRef.init();
    // El despacho cada 15 s competiría con los llamados a mano de los tests.
    moduleRef.get(SchedulerRegistry).deleteInterval('outbox-dispatch');
    prisma = moduleRef.get(PrismaService);
    dispatcher = moduleRef.get(OutboxDispatcher);
    // Lo mismo el despacho inmediato (F11·6), salvo en su propio test.
    soon = jest.spyOn(dispatcher, 'soon').mockImplementation(() => undefined);
    // Un puerto libre que después se reusa: primero el sitio está "apagado".
    await storefront.start();
    target.url = `http://127.0.0.1:${storefront.port}/api/internal/events`;
    await storefront.stop();
  });

  afterAll(async () => {
    await storefront.stop();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.outboxEvent.deleteMany();
    fx = await seedFixtures(prisma);
    target.secret = SECRET;
    storefront.received = [];
    storefront.status = 200;
  });

  const saveSettings = () =>
    moduleRef.get(WebSettingsService).save(
      {
        shippingFlatRate: 4500,
        freeShippingFrom: null,
        pickupEnabled: true,
        pickupInstructions: '',
        bankTransferEnabled: false,
        bankTransferInstructions: '',
        notificationEmail: '',
      },
      fx.userId,
    );

  it('con el sitio apagado queda pendiente y se entrega firmado al prenderlo', async () => {
    await saveSettings();
    const [event] = await prisma.outboxEvent.findMany();
    expect(event).toMatchObject({
      type: 'catalog.changed',
      payload: { scope: 'settings', ids: [] },
    });

    const t0 = new Date();
    expect(await dispatcher.dispatchDue(t0)).toEqual({ delivered: 0, retried: 1, failed: 0 });
    const pendiente = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event!.id } });
    expect(pendiente).toMatchObject({ attempts: 1, deliveredAt: null, lastError: 'ECONNREFUSED' });
    expect(pendiente.nextAttemptAt.getTime()).toBe(t0.getTime() + retryDelayMs(1));

    // Antes del backoff no se vuelve a intentar.
    expect(await dispatcher.dispatchDue(new Date(t0.getTime() + 1_000))).toEqual({
      delivered: 0,
      retried: 0,
      failed: 0,
    });

    await storefront.start(storefront.port);
    const t1 = new Date(t0.getTime() + retryDelayMs(1));
    expect(await dispatcher.dispatchDue(t1)).toEqual({ delivered: 1, retried: 0, failed: 0 });

    const [request] = storefront.received;
    expect(JSON.parse(request!.body)).toEqual({
      event: 'catalog.changed',
      scope: 'settings',
      ids: [],
    });
    expect(request!.headers['x-tp-event-id']).toBe(event!.id);
    expect(
      verifyEvent({
        secrets: [SECRET],
        timestamp: request!.headers['x-tp-timestamp'] as string,
        signature: request!.headers['x-tp-signature'] as string,
        body: request!.body,
        now: Math.floor(t1.getTime() / 1000),
      }),
    ).toEqual({ ok: true });
    const entregado = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event!.id } });
    expect(entregado.deliveredAt).not.toBeNull();
    expect(entregado.lastError).toBeNull();
    await storefront.stop();
  });

  it('un error del sitio se reintenta y a las 48 h se abandona', async () => {
    await storefront.start(storefront.port);
    storefront.status = 500;
    await saveSettings();
    const t0 = new Date();
    expect(await dispatcher.dispatchDue(t0)).toMatchObject({ retried: 1 });
    expect((await prisma.outboxEvent.findFirstOrThrow()).lastError).toBe('HTTP 500');

    const late = new Date(t0.getTime() + GIVE_UP_AFTER_MS + 1);
    expect(await dispatcher.dispatchDue(late)).toMatchObject({ failed: 1 });
    expect((await prisma.outboxEvent.findFirstOrThrow()).failedAt).not.toBeNull();
    // Abandonado: no se reintenta más.
    expect(await dispatcher.dispatchDue(new Date(late.getTime() + 3_600_000))).toEqual({
      delivered: 0,
      retried: 0,
      failed: 0,
    });
    await storefront.stop();
  });

  it('un aviso nuevo sale enseguida, sin esperar el ciclo de 15 s (F11·6)', async () => {
    soon.mockRestore();
    try {
      await storefront.start(storefront.port);
      await saveSettings();
      const deadline = Date.now() + 3_000;
      while (storefront.received.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(storefront.received).toHaveLength(1);
      expect(JSON.parse(storefront.received[0]!.body)).toMatchObject({ scope: 'settings' });
    } finally {
      soon = jest.spyOn(dispatcher, 'soon').mockImplementation(() => undefined);
      await storefront.stop();
    }
  });

  it('el backoff duplica de 30 s hasta 1 h', () => {
    expect([1, 2, 3, 4, 7, 8, 20].map(retryDelayMs)).toEqual([
      30_000, 60_000, 120_000, 240_000, 1_920_000, 3_600_000, 3_600_000,
    ]);
  });

  it('sin secreto no se manda nada y el aviso espera', async () => {
    target.secret = undefined;
    await saveSettings();
    expect(await dispatcher.dispatchDue()).toEqual({ delivered: 0, retried: 0, failed: 0 });
    expect((await prisma.outboxEvent.findFirstOrThrow()).attempts).toBe(0);
  });

  it('el panel ve los avisos atrasados más de 1 h', async () => {
    await saveSettings();
    await prisma.outboxEvent.updateMany({
      data: { createdAt: new Date(Date.now() - 2 * 3_600_000), lastError: 'ECONNREFUSED' },
    });
    await saveSettings();
    expect(await moduleRef.get(OutboxService).status()).toMatchObject({
      pending: 2,
      stuck: 1,
      failed: 0,
      lastError: 'ECONNREFUSED',
    });
  });

  describe('qué cambios avisan', () => {
    let pubId: string;
    beforeEach(async () => {
      const products = moduleRef.get(WebProductsService);
      pubId = (
        await products.create(
          {
            name: 'Maceta',
            description: 'Maceta facetada.',
            members: [{ productId: fx.productId, valueLabel: '' }],
          },
          fx.userId,
        )
      ).id;
      await moduleRef.get(WebVariantsService).regenerate(pubId, fx.userId);
      await prisma.webImage.create({
        data: { webProductId: pubId, path: 'catalog/m.webp', width: 10, height: 10 },
      });
      await prisma.outboxEvent.deleteMany();
    });
    const payloads = async () =>
      (await prisma.outboxEvent.findMany({ orderBy: { createdAt: 'asc' } })).map((e) => e.payload);

    it('un borrador no avisa; publicado, cada cambio avisa con su slug (y el viejo)', async () => {
      const products = moduleRef.get(WebProductsService);
      await products.update(pubId, { summary: 'Para cactus' }, fx.userId);
      expect(await payloads()).toEqual([]);

      await moduleRef.get(WebPublicationService).publish(pubId, fx.userId);
      await products.update(pubId, { slug: 'maceta-geo' }, fx.userId);
      expect(await payloads()).toEqual([
        { scope: 'product', ids: ['maceta'] },
        { scope: 'product', ids: ['maceta-geo', 'maceta'] },
      ]);
    });

    it('un cambio que falla no deja aviso', async () => {
      await moduleRef.get(WebPublicationService).publish(pubId, fx.userId);
      await prisma.outboxEvent.deleteMany();
      const otra = await moduleRef.get(WebProductsService).create({ name: 'Otra' }, fx.userId);

      await expect(
        moduleRef.get(WebProductsService).update(pubId, { slug: otra.slug }, fx.userId),
      ).rejects.toThrow(/ya lo usa otra publicación/);
      expect(await payloads()).toEqual([]);
    });
  });
});
