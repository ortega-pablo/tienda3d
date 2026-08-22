/**
 * Suite de integración: corre contra un Postgres REAL, no mocks.
 *
 * Requiere la base levantada (`docker compose up -d db`). Usa una base
 * separada (`tienda3d_test` por default) que se migra y se trunca entre tests:
 * nunca toca los datos del taller.
 *
 *   pnpm test:int
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '\\.int-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFilesAfterEnv: ['<rootDir>/test/setup-env.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  // Las transacciones y el truncate serializan mal en paralelo.
  maxWorkers: 1,
  testTimeout: 30_000,
};
