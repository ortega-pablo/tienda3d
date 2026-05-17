import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { CustomersModule } from './modules/customers/customers.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { KeychainTiersModule } from './modules/keychain-tiers/keychain-tiers.module';
import { MachinesModule } from './modules/machines/machines.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { ParametersModule } from './modules/parameters/parameters.module';
import { ProductionsModule } from './modules/productions/productions.module';
import { ProductsModule } from './modules/products/products.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    // NestJS aplica TODOS los throttlers a cada ruta, no sólo el "matching".
    // Por eso `auth` global queda generoso (similar al default) y los límites
    // estrictos contra brute-force se ponen route-by-route con @Throttle()
    // (login: 10/min, refresh: 30/min). Así /auth/me, que se llama por cada
    // navegación a una ruta protegida, no se trabaja por el límite de auth.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      { name: 'auth', ttl: 60_000, limit: 120 },
    ]),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    ParametersModule,
    MachinesModule,
    SuppliersModule,
    MaterialsModule,
    ChannelsModule,
    CategoriesModule,
    ProductsModule,
    CustomersModule,
    QuotesModule,
    KeychainTiersModule,
    ProductionsModule,
    ReportsModule,
    IntegrationsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
