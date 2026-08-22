import { toLibpqUrl } from './database-backup.controller';

/**
 * F-29: el endpoint de backup le pasaba DATABASE_URL crudo a pg_dump, y esa URL
 * trae `?schema=public` (viene así desde el .env.example). libpq lo rechaza con
 * "invalid URI query parameter", así que el backup fallaba en toda instalación.
 */
describe('toLibpqUrl', () => {
  it('saca los parámetros que sólo entiende Prisma', () => {
    expect(toLibpqUrl('postgresql://u:p@db:5432/tienda3d?schema=public')).toBe(
      'postgresql://u:p@db:5432/tienda3d',
    );
    expect(
      toLibpqUrl('postgresql://u:p@db:5432/t?schema=public&connection_limit=5'),
    ).toBe('postgresql://u:p@db:5432/t');
  });

  it('conserva los que libpq sí entiende', () => {
    expect(toLibpqUrl('postgresql://u:p@db:5432/t?sslmode=require&schema=public')).toBe(
      'postgresql://u:p@db:5432/t?sslmode=require',
    );
  });

  it('no toca una URL que ya está limpia', () => {
    const url = 'postgresql://u:p@db:5432/tienda3d';
    expect(toLibpqUrl(url)).toBe(url);
  });

  it('degrada sin romper si la cadena no parsea', () => {
    expect(toLibpqUrl('no-es-una-url?schema=public')).toBe('no-es-una-url');
  });
});
