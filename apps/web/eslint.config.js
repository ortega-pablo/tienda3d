// ESLint 9 (flat config). Reemplaza a `next lint`, que fue eliminado en
// Next 16 — el script seguía apuntando a un comando que ya no existe.
//
// eslint-config-next 16 exporta directamente arrays de flat config.
const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');
const nextTypescript = require('eslint-config-next/typescript');

module.exports = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '*.config.js', '*.config.mjs'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // El proyecto no usa `any` en ningún lado; que siga siendo así.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Dependencias de hooks: el bug clásico de estado desincronizado.
      'react-hooks/exhaustive-deps': 'error',

      // Las dos reglas de abajo vienen de eslint-plugin-react-hooks v7 y son
      // chequeos de compatibilidad con el React Compiler, no detección de bugs.
      // Marcan 10 sitios que son patrones establecidos y correctos hoy: el
      // guard de hidratación de next-themes, la lectura de localStorage en
      // mount, los setState de reset antes de un fetch y la sincronización con
      // props del server. Adoptarlas es una migración propia, con su propio
      // testing — no parte de esta corrección. Quedan documentadas como
      // pendiente en el plan (docs/plans/correcciones-auditoria-2026-08.md).
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
    },
  },
];
