import { TEST_APP_DATABASE_URL } from './db-url';

// PrismaService extiende PrismaClient sin datasource explícito, así que lee
// DATABASE_URL del entorno. Se apunta a la base de tests ANTES de que Nest
// instancie nada, con el rol sin privilegios de la app (F2·6): si algo de la
// API necesitara DDL, falla acá.
process.env.DATABASE_URL = TEST_APP_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-secret-de-32-caracteres-o-mas!!';
process.env.REFRESH_SECRET ??= 'otro-secret-de-32-caracteres-o-mas!!';
