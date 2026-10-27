import { validateEnv } from './env.schema';

const base = {
  DATABASE_URL: 'postgresql://u:p@db:5432/t',
  JWT_SECRET: 'a'.repeat(32),
  REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('completa los valores por defecto', () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({ NODE_ENV: 'development', PORT: 3001, JWT_EXPIRES_IN: '15m', REFRESH_EXPIRES_IN: '7d' });
  });

  it('convierte el puerto a número', () => {
    expect(validateEnv({ ...base, PORT: '4000' }).PORT).toBe(4000);
  });

  it('corta nombrando cada variable obligatoria que falta', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*REFRESH_SECRET/);
    expect(() => validateEnv({ ...base, JWT_SECRET: undefined })).toThrow(/JWT_SECRET_FILE/);
  });

  it('rechaza un NODE_ENV desconocido y un flag de integración inválido', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'prod' })).toThrow(/NODE_ENV/);
    expect(() => validateEnv({ ...base, INTEGRATION_MELI_ENABLED: 'si' })).toThrow(/INTEGRATION_MELI_ENABLED/);
  });

  it('trata las variables vacías del compose como ausentes', () => {
    expect(validateEnv({ ...base, BRAND_LOGO_PATH: '', INTEGRATION_ARCA_ENABLED: '' })).toMatchObject({
      BRAND_LOGO_PATH: undefined,
      INTEGRATION_ARCA_ENABLED: undefined,
    });
  });

  it('deja pasar el resto del entorno', () => {
    expect(validateEnv({ ...base, PATH: '/usr/bin' }).PATH).toBe('/usr/bin');
  });
});
