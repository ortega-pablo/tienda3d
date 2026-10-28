import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/** Límites de subida de fotos (plan F6·2). */
export const IMAGE_UPLOAD = {
  maxBytes: 15 * 1024 * 1024,
  maxFiles: 10,
  /** Lado mayor de la foto guardada: suficiente para el zoom de la ficha. */
  maxSide: 2000,
  /** Más píxeles que una foto de 48 MP es sospechoso (bomba de descompresión). */
  maxInputPixels: 60_000_000,
} as const;

export type ImageKind = 'jpeg' | 'png' | 'webp';

/** Tipo real por los primeros bytes: la extensión y el Content-Type los elige quien sube. */
export function detectImageKind(data: Buffer): ImageKind | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg';
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Foto liviana para la web: WebP, como mucho `maxSide` px de lado, girada
 * según su EXIF y sin metadatos (ni EXIF ni GPS).
 */
export async function toWebImage(data: Buffer, name: string): Promise<ProcessedImage> {
  if (!detectImageKind(data)) {
    throw new BadRequestException(`"${name}" no es una foto JPG, PNG o WebP.`);
  }
  try {
    const { data: out, info } = await sharp(data, {
      limitInputPixels: IMAGE_UPLOAD.maxInputPixels,
      failOn: 'error',
    })
      .rotate()
      .resize({
        width: IMAGE_UPLOAD.maxSide,
        height: IMAGE_UPLOAD.maxSide,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data: out, width: info.width, height: info.height };
  } catch {
    throw new BadRequestException(`"${name}" está dañada o es demasiado grande para procesarla.`);
  }
}
