import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let base: string;
  let storage: StorageService;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'storage-spec-'));
    // Un secreto fuera de las raíces, al lado: lo que un ../ querría leer.
    await writeFile(join(base, 'secreto.json'), '{"clave":"no"}');
    storage = new StorageService({ media: join(base, 'media'), private: join(base, 'private') });
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('guarda con un nombre generado, lee y borra', async () => {
    const path = await storage.save('media', 'catalog/abc123', 'webp', Buffer.from('foto'));

    expect(path).toMatch(/^catalog\/abc123\/[0-9a-f-]{36}\.webp$/);
    expect((await storage.read('media', path)).toString()).toBe('foto');
    // No quedan temporales de la escritura atómica.
    expect(await readdir(join(base, 'media', 'catalog', 'abc123'))).toHaveLength(1);

    await storage.delete('media', path);
    await expect(storage.read('media', path)).rejects.toThrow(/inexistente/);
    // Borrar algo que ya no está no es un error.
    await expect(storage.delete('media', path)).resolves.toBeUndefined();
  });

  it('las áreas no se mezclan', async () => {
    const path = await storage.save('private', 'backups', 'json', Buffer.from('{}'));
    await expect(storage.read('media', path)).rejects.toThrow(/inexistente/);
  });

  it.each([
    ['../secreto.json'],
    ['catalog/../../secreto.json'],
    ['/etc/passwd'],
    ['catalog\\..\\..\\secreto.json'],
    ['catalog/foto.webp\0.txt'],
    ['catalog//foto.webp'],
    ['.env'],
  ])('rechaza leer o borrar %j', async (path) => {
    await expect(storage.read('media', path)).rejects.toThrow(/Ruta de archivo inválida/);
    await expect(storage.delete('media', path)).rejects.toThrow(/Ruta de archivo inválida/);
  });

  it('rechaza carpetas armadas desde afuera y extensiones no admitidas', async () => {
    for (const folder of ['../afuera', 'catalog/..', '/tmp', 'catalog/a b', '']) {
      await expect(storage.save('media', folder, 'webp', Buffer.from('x'))).rejects.toThrow(
        /Carpeta de archivos inválida/,
      );
    }
    await expect(storage.save('media', 'catalog', 'html', Buffer.from('x'))).rejects.toThrow(
      /no admitido/,
    );
  });

  it('un enlace simbólico que apunta afuera de la raíz no se sigue', async () => {
    await mkdir(join(base, 'media', 'catalog'), { recursive: true });
    await symlink(join(base, 'secreto.json'), join(base, 'media', 'catalog', 'trampa.json'));
    await symlink(base, join(base, 'media', 'escape'));

    await expect(storage.read('media', 'catalog/trampa.json')).rejects.toThrow(
      /Ruta de archivo inválida/,
    );
    await expect(storage.read('media', 'escape/secreto.json')).rejects.toThrow(
      /Ruta de archivo inválida/,
    );
    await expect(storage.save('media', 'escape', 'json', Buffer.from('x'))).rejects.toThrow(
      /Ruta de archivo inválida/,
    );
  });
});
