import {
  assertSecrets,
  databasePasswordIssue,
  findSecretIssues,
  seedAdminPasswordIssue,
} from './validate-secrets';

const good = {
  JWT_SECRET: 'K7d0aPq2wZ8xLm4RtV6yBn1CsE3fHj5U',
  REFRESH_SECRET: 'Qw9eRt2yUi4oPa6sDf8gHj0kLz1xCv3B',
} as NodeJS.ProcessEnv;

describe('validate-secrets', () => {
  it('acepta secretos largos y distintos', () => {
    expect(findSecretIssues(good)).toEqual([]);
  });

  it('rechaza los valores del .env.example', () => {
    const issues = findSecretIssues({
      JWT_SECRET: 'replace-with-32-byte-random-string',
      REFRESH_SECRET: 'replace-with-another-32-byte-random',
    } as NodeJS.ProcessEnv);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.reason).toMatch(/ejemplo/);
  });

  it('rechaza secretos cortos y secretos repetidos', () => {
    // dos hallazgos por longitud + uno por ser iguales entre sí
    expect(
      findSecretIssues({ JWT_SECRET: 'corto', REFRESH_SECRET: 'corto' } as NodeJS.ProcessEnv),
    ).toHaveLength(3);
  });

  it('aborta en producción y sólo advierte en desarrollo', () => {
    const bad = { JWT_SECRET: 'changeme', REFRESH_SECRET: 'changeme' } as NodeJS.ProcessEnv;
    expect(() => assertSecrets(bad, true)).toThrow(/no se arranca en producción/);

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => assertSecrets(bad, false)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('revisa la contraseña de la base cuando hay DATABASE_URL', () => {
    const conBase = (password: string) =>
      findSecretIssues({ ...good, DATABASE_URL: `postgresql://tienda3d:${password}@db:5432/tienda3d` });
    expect(conBase('changeme')[0]).toMatchObject({ variable: 'DATABASE_URL', reason: expect.stringMatching(/ejemplo/) });
    expect(conBase('corta')[0]!.reason).toMatch(/al menos 16/);
    expect(conBase('Xk2pL9vQ7wR4tY8zN5m')).toEqual([]);
  });

  it('exige las credenciales de cada integración habilitada', () => {
    const issues = findSecretIssues({ ...good, INTEGRATION_MELI_ENABLED: 'true', MELI_CLIENT_ID: 'id' });
    expect(issues).toEqual([{ variable: 'MELI_CLIENT_SECRET', reason: expect.stringMatching(/INTEGRATION_MELI_ENABLED/) }]);
    expect(findSecretIssues({ ...good, INTEGRATION_ARCA_ENABLED: 'false' })).toEqual([]);
  });
});

describe('databasePasswordIssue', () => {
  it('detecta URL sin contraseña, inválida o con caracteres codificados', () => {
    expect(databasePasswordIssue('postgresql://u@db:5432/t')).toMatch(/no tiene contraseña/);
    expect(databasePasswordIssue('no es url')).toMatch(/no es una URL/);
    expect(databasePasswordIssue('postgresql://u:pl%61stik-dev@db/t')).toMatch(/ejemplo/);
  });
});

describe('seedAdminPasswordIssue', () => {
  it('no deja crear un admin de producción con una clave débil o pública', () => {
    expect(seedAdminPasswordIssue(undefined)).toMatch(/no está definida/);
    expect(seedAdminPasswordIssue('admin123')).toMatch(/ejemplo/);
    expect(seedAdminPasswordIssue('corta1')).toMatch(/al menos 12/);
    expect(seedAdminPasswordIssue('una-clave-larga-y-propia')).toBeNull();
  });
});

