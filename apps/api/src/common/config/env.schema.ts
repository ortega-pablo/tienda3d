import { z } from 'zod';

/** "" → undefined: docker compose pasa las variables vacías como string vacío. */
const optional = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const flag = z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional());

/**
 * Todas las variables que lee la API. Se valida al arrancar (`ConfigModule`):
 * una variable obligatoria que falta corta el arranque con su nombre, en vez de
 * fallar más tarde en el primer request que la use.
 *
 * Los secretos pueden venir de archivo (`NOMBRE_FILE`, ver `secret-files.ts`);
 * para cuando llegan acá ya se cargaron en `NOMBRE`. Que tengan la fuerza
 * suficiente lo revisa `assertSecrets`.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),

    DATABASE_URL: z.string({ required_error: 'falta DATABASE_URL (o DATABASE_URL_FILE)' }).min(1),

    JWT_SECRET: z.string({ required_error: 'falta JWT_SECRET (o JWT_SECRET_FILE)' }).min(1),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_SECRET: z
      .string({ required_error: 'falta REFRESH_SECRET (o REFRESH_SECRET_FILE)' })
      .min(1),
    REFRESH_EXPIRES_IN: z.string().default('7d'),

    BRAND_LOGO_PATH: optional,

    /** Fotos de la tienda (volumen `media`, el sitio lo monta de solo lectura). */
    MEDIA_DIR: z.string().min(1).default('./storage/media'),
    /** Archivos que no se publican (volumen `t3d-private`). */
    PRIVATE_DIR: z.string().min(1).default('./storage/private'),

    INTEGRATION_MELI_ENABLED: flag,
    MELI_CLIENT_ID: optional,
    MELI_CLIENT_SECRET: optional,
    MELI_REFRESH_TOKEN: optional,
    INTEGRATION_ARCA_ENABLED: flag,
    ARCA_CUIT: optional,
    ARCA_CERT: optional,
    ARCA_KEY: optional,
    INTEGRATION_WHATSAPP_ENABLED: flag,
    WHATSAPP_PHONE_ID: optional,
    WHATSAPP_TOKEN: optional,
  })
  // El resto del entorno (PATH, npm_package_version…) pasa sin tocar.
  .passthrough();

export type Env = z.infer<typeof envSchema>;

/** `validate` del `ConfigModule`: devuelve el entorno tipado o corta con el detalle. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(entorno)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Configuración inválida, no se arranca:\n${detail}`);
}
