import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

/** `media` se publica (el sitio lo lee); `private` no sale nunca del sistema. */
export type StorageArea = 'media' | 'private';

/** Carpeta raíz de cada área (`MEDIA_DIR`, `PRIVATE_DIR`). */
export type StorageRoots = Record<StorageArea, string>;
export const STORAGE_ROOTS = Symbol('STORAGE_ROOTS');

/** Extensiones que el sistema guarda. Las fotos se convierten a WebP (F6·2). */
const EXTENSIONS = new Set(['webp', 'pdf', 'json']);

/** Una carpeta la arma el sistema con ids: `catalog/<id>`, nada más. */
const SEGMENT = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** Una ruta relativa válida: segmentos como los de arriba y un archivo `<nombre>.<ext>`. */
const RELATIVE_PATH = /^(?:[a-z0-9][a-z0-9_-]{0,63}\/)*[a-z0-9][a-z0-9_-]{0,63}\.[a-z0-9]{1,8}$/i;

/**
 * Archivos en los volúmenes (plan F6·1, T9). Las rutas las genera el sistema
 * (`<carpeta>/<uuid>.<ext>`) y cada lectura o borrado se resuelve dentro de su
 * raíz: ni `../`, ni rutas absolutas, ni un enlace simbólico que apunte afuera.
 */
@Injectable()
export class StorageService {
  private readonly roots: StorageRoots;

  constructor(@Inject(STORAGE_ROOTS) roots: StorageRoots) {
    this.roots = { media: resolve(roots.media), private: resolve(roots.private) };
  }

  /** Guarda un archivo nuevo y devuelve su ruta relativa a la raíz del área. */
  async save(area: StorageArea, folder: string, ext: string, data: Buffer): Promise<string> {
    const segments = folder.split('/');
    if (!segments.every((s) => SEGMENT.test(s))) {
      throw new BadRequestException('Carpeta de archivos inválida.');
    }
    if (!EXTENSIONS.has(ext)) throw new BadRequestException('Tipo de archivo no admitido.');

    const relative = `${segments.join('/')}/${randomUUID()}.${ext}`;
    const target = this.lexical(area, relative);
    await mkdir(dirname(target), { recursive: true });
    await this.assertInside(area, dirname(target));

    // Escritura atómica: el sitio nunca ve un archivo a medio escribir.
    const tmp = `${target}.tmp-${randomUUID()}`;
    await writeFile(tmp, data, { flag: 'wx' });
    await rename(tmp, target);
    return relative;
  }

  async read(area: StorageArea, relative: string): Promise<Buffer> {
    const target = await this.resolveExisting(area, relative);
    return readFile(target);
  }

  /** Borra un archivo; si ya no estaba, no es un error. */
  async delete(area: StorageArea, relative: string): Promise<void> {
    const target = this.lexical(area, relative);
    try {
      await this.assertInside(area, await realpath(target));
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    await rm(target, { force: true });
  }

  /** Ruta absoluta de un archivo existente, para servirlo (F6·3). */
  async resolveExisting(area: StorageArea, relative: string): Promise<string> {
    const target = this.lexical(area, relative);
    try {
      const real = await realpath(target);
      await this.assertInside(area, real);
      return real;
    } catch (error) {
      if (isMissing(error)) throw new NotFoundException('Archivo inexistente');
      throw error;
    }
  }

  // ----- internals -----

  /** Control sobre el texto de la ruta, antes de tocar el disco. */
  private lexical(area: StorageArea, relative: string): string {
    if (
      typeof relative !== 'string' ||
      isAbsolute(relative) ||
      relative.includes('\\') ||
      relative.includes('\0') ||
      !RELATIVE_PATH.test(relative)
    ) {
      throw new BadRequestException('Ruta de archivo inválida.');
    }
    const root = this.roots[area];
    const target = resolve(root, relative);
    if (!target.startsWith(root + sep)) throw new BadRequestException('Ruta de archivo inválida.');
    return target;
  }

  /** Control sobre el disco: la ruta real (enlaces resueltos) sigue dentro de la raíz. */
  private async assertInside(area: StorageArea, path: string): Promise<void> {
    const root = await realpath(this.roots[area]);
    const real = await realpath(path);
    if (real !== root && !real.startsWith(root + sep)) {
      throw new BadRequestException('Ruta de archivo inválida.');
    }
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}
