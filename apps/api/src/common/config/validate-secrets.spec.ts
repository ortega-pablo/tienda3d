import { assertSecrets, findSecretIssues } from './validate-secrets';

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
});
