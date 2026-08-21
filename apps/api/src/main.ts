import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertSecrets } from './common/config/validate-secrets';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const isProd = config.get<string>('NODE_ENV') === 'production';

  // Falla temprano si los secretos de firma son los del .env.example o son
  // demasiado cortos. Antes sólo se verificaba que existieran.
  assertSecrets(process.env, isProd);

  // Confía en 1 hop de proxy para resolver la IP del cliente (rate limit, logs).
  //
  // OJO: esto sólo es seguro si el proxy inmediato SETEA `x-forwarded-for`. Hoy
  // el proxy de Next (apps/web/src/app/api/[...path]/route.ts) borra las
  // cabeceras `x-forwarded-*` que manda el navegador justamente para que no se
  // pueda falsificar `req.ip`; el efecto es que todos los usuarios comparten la
  // IP del contenedor `web`, que es por qué la defensa real contra fuerza bruta
  // es el bloqueo por cuenta de AuthService y no este límite.
  //
  // Cuando se agregue un nginx o un ALB adelante (ver migración a AWS en el
  // README), ese proxy debe setear `x-forwarded-for` con la IP real y entonces
  // el límite por IP vuelve a ser significativo.
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000').split(','),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));

  const port = config.get<number>('PORT', 3001);
  await app.listen(port, '0.0.0.0');
  console.log(
    `🚀 API listening on http://0.0.0.0:${port}/api (mode: ${isProd ? 'production' : 'development'})`,
  );
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
