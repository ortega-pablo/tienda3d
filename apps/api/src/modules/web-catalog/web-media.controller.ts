import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { StorageService } from '@/common/storage/storage.service';

/** Lo único que se sirve del volumen: las fotos convertidas por el sistema. */
const MEDIA_TYPES: Record<string, string> = { webp: 'image/webp' };

/**
 * Fotos del volumen `media` para el panel (plan F6·3). El sitio las sirve por
 * su cuenta; acá pasan por la sesión del sistema.
 */
@UseGuards(PermissionsGuard)
@Controller('web-catalog/media')
export class WebMediaController {
  constructor(private readonly storage: StorageService) {}

  @Permissions('ecommerce:read')
  @Get('*path')
  async read(
    @Param('path') path: string[] | string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const relative = Array.isArray(path) ? path.join('/') : path;
    const type = MEDIA_TYPES[relative.split('.').pop() ?? ''];
    if (!type) throw new NotFoundException('Archivo inexistente');

    const file = await this.storage.resolveExisting('media', relative);
    res.set({
      'Content-Type': type,
      // El nombre es un uuid: el contenido de una ruta no cambia nunca.
      'Cache-Control': 'private, max-age=86400, immutable',
    });
    return new StreamableFile(createReadStream(file));
  }
}
