import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSecretFiles, readSecret } from './secret-files';

function secretFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'secretos-')), 'secreto');
  writeFileSync(path, content);
  return path;
}

describe('readSecret', () => {
  it('lee NOMBRE_FILE y le saca el salto de línea final', () => {
    const env = { JWT_SECRET_FILE: secretFile('desde-archivo\n') };
    expect(readSecret('JWT_SECRET', env)).toBe('desde-archivo');
  });

  it('el archivo gana sobre la variable', () => {
    const env = { JWT_SECRET: 'desde-env', JWT_SECRET_FILE: secretFile('desde-archivo') };
    expect(readSecret('JWT_SECRET', env)).toBe('desde-archivo');
  });

  it('sin archivo usa la variable', () => {
    expect(readSecret('JWT_SECRET', { JWT_SECRET: 'desde-env' })).toBe('desde-env');
    expect(readSecret('JWT_SECRET', {})).toBeUndefined();
  });

  it('un archivo que no existe corta con el nombre de la variable', () => {
    expect(() => readSecret('JWT_SECRET', { JWT_SECRET_FILE: '/no/existe' })).toThrow(/JWT_SECRET_FILE/);
  });
});

describe('loadSecretFiles', () => {
  it('carga en el entorno solo los secretos que vienen de archivo', () => {
    const env: NodeJS.ProcessEnv = {
      DATABASE_URL_FILE: secretFile('postgresql://u:p@db:5432/t\n'),
      REFRESH_SECRET: 'sin-tocar',
    };
    loadSecretFiles(env);
    expect(env.DATABASE_URL).toBe('postgresql://u:p@db:5432/t');
    expect(env.REFRESH_SECRET).toBe('sin-tocar');
    expect(env.JWT_SECRET).toBeUndefined();
  });
});
