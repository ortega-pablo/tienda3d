// ESLint 9 (flat config). Antes no existía ningún config en el repo: ESLint 9
// exige este formato y abortaba, así que `pnpm lint` no validaba nada.
//
// La base es `flat/recommended` (sin type-checking, rápido) más las reglas
// type-aware que rinden en un backend con async por todos lados: una promesa
// sin await en NestJS se traga el error y la request responde 200.
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/seed.js', '*.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // tsconfig.spec.json suma test/ y los *.int-spec.ts, que el tsconfig
        // de build excluye para no emitirlos en dist.
        project: ['./tsconfig.json', './tsconfig.spec.json'],
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
    },
    rules: {
      // TypeScript ya resuelve los identificadores; `no-undef` sólo produce
      // falsos positivos sobre globals de Node y de Jest.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Reglas type-aware: el motivo por el que vale la pena pagar el `project`.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
    },
  },
  {
    // Los specs usan `any` y non-null assertions para armar fixtures.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Los mocks devuelven promesas porque imitan el contrato del servicio
      // real, no porque esperen algo.
      '@typescript-eslint/require-await': 'off',
    },
  },
];
