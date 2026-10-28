import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { WebImageUpdateInput, WebProductDto } from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { toWebImage, type ProcessedImage } from '@/common/storage/images';
import { StorageService } from '@/common/storage/storage.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogEvents } from './catalog-events';
import { WebProductsService } from './web-products.service';

/** Tope de fotos por publicación. */
export const MAX_IMAGES_PER_PRODUCT = 30;

/** Archivo subido, lo que el servicio necesita de multer. */
export interface UploadedImage {
  originalname: string;
  buffer: Buffer;
}

/**
 * Galería de una publicación (plan F6·2): fotos en el volumen `media`, en
 * `catalog/<publicación>/<uuid>.webp`.
 */
@Injectable()
export class WebImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: CatalogEvents,
    private readonly storage: StorageService,
    private readonly products: WebProductsService,
  ) {}

  async upload(
    webProductId: string,
    files: UploadedImage[],
    actorId: string,
  ): Promise<WebProductDto> {
    if (!files.length) throw new BadRequestException('No llegó ninguna foto.');
    await this.products.get(webProductId);
    const current = await this.prisma.webImage.count({ where: { webProductId } });
    if (current + files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(
        `Una publicación tiene hasta ${MAX_IMAGES_PER_PRODUCT} fotos (ya tiene ${current}).`,
      );
    }

    // Primero se procesan todas: si una no sirve, no se guarda ninguna.
    const processed: Array<ProcessedImage & { name: string }> = [];
    for (const file of files) {
      processed.push({
        ...(await toWebImage(file.buffer, file.originalname)),
        name: file.originalname,
      });
    }

    const saved: string[] = [];
    try {
      for (const image of processed) {
        saved.push(await this.storage.save('media', `catalog/${webProductId}`, 'webp', image.data));
      }
      await this.prisma.$transaction(async (tx) => {
        const last = await tx.webImage.aggregate({
          where: { webProductId },
          _max: { position: true },
        });
        const start = (last._max.position ?? -1) + 1;
        await this.events.productChanged(tx, webProductId);
        await tx.webImage.createMany({
          data: processed.map((image, i) => ({
            webProductId,
            path: saved[i]!,
            width: image.width,
            height: image.height,
            position: start + i,
          })),
        });
      });
    } catch (error) {
      await Promise.all(saved.map((path) => this.storage.delete('media', path)));
      throw error;
    }

    await this.audit.record({
      actorId,
      entity: 'WebProduct',
      entityId: webProductId,
      action: 'upload-images',
      after: { files: processed.map((p, i) => ({ name: p.name, path: saved[i] })) },
    });
    return this.products.get(webProductId);
  }

  async update(
    webProductId: string,
    imageId: string,
    input: WebImageUpdateInput,
    actorId: string,
  ): Promise<WebProductDto> {
    const before = await this.find(webProductId, imageId);

    if (input.colorMaterialId) {
      const offered = await this.prisma.webColorValue.count({
        where: { materialId: input.colorMaterialId, option: { webProductId, isActive: true } },
      });
      if (!offered) {
        throw new BadRequestException('Ese color no se ofrece en esta publicación.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const { position, ...rest } = input;
      await this.events.productChanged(tx, webProductId);
      if (Object.keys(rest).length) {
        await tx.webImage.update({ where: { id: imageId }, data: rest });
      }
      if (position !== undefined) {
        // Se mueve a su lugar y se renumera la galería (0, 1, 2…).
        const order = await tx.webImage.findMany({
          where: { webProductId },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        const ids = order.map((i) => i.id).filter((id) => id !== imageId);
        ids.splice(Math.min(position, ids.length), 0, imageId);
        for (const [index, id] of ids.entries()) {
          await tx.webImage.update({ where: { id }, data: { position: index } });
        }
      }
    });

    await this.audit.record({
      actorId,
      entity: 'WebImage',
      entityId: imageId,
      action: 'update',
      before: Object.fromEntries(
        Object.keys(input).map((k) => [k, before[k as keyof typeof before]]),
      ),
      after: input,
    });
    return this.products.get(webProductId);
  }

  /** Borra la foto y su archivo. Las variantes que la usaban quedan sin foto propia. */
  async remove(webProductId: string, imageId: string, actorId: string): Promise<WebProductDto> {
    const image = await this.find(webProductId, imageId);
    await this.prisma.$transaction(async (tx) => {
      await tx.webImage.delete({ where: { id: imageId } });
      await this.events.productChanged(tx, webProductId);
    });
    await this.storage.delete('media', image.path);

    await this.audit.record({
      actorId,
      entity: 'WebImage',
      entityId: imageId,
      action: 'delete',
      before: { webProductId, path: image.path, alt: image.alt },
    });
    return this.products.get(webProductId);
  }

  private async find(webProductId: string, imageId: string) {
    const image = await this.prisma.webImage.findUnique({ where: { id: imageId } });
    if (!image || image.webProductId !== webProductId) {
      throw new NotFoundException('Foto inexistente en esta publicación');
    }
    return image;
  }
}
