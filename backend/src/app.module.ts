import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { CatalogModule } from './catalog/catalog.module';
import type { AppConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ApiExceptionFilter } from './errors/api-exception.filter';
import { HealthModule } from './health/health.module';
import { InsightsModule } from './insights/insights.module';
import { buildPinoHttpOptions } from './logging/logger-options';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReservationsModule } from './reservations/reservations.module';
import { SharedKernelModule } from './shared-kernel/shared-kernel.module';
import { TestingModule } from './testing/testing.module';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    const providers: Provider[] = [{ provide: APP_FILTER, useClass: ApiExceptionFilter }];

    if (config.throttleEnabled) {
      providers.push({ provide: APP_GUARD, useClass: ThrottlerGuard });
    }

    const testingModules =
      config.nodeEnv === 'test' || config.nodeEnv === 'e2e' ? [TestingModule] : [];

    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot({ pinoHttp: buildPinoHttpOptions(config) }),
        ThrottlerModule.forRoot([
          {
            name: 'default',
            ttl: config.throttleTtlSeconds * 1000,
            limit: config.throttleLimit,
          },
        ]),
        DatabaseModule,
        SharedKernelModule,
        CatalogModule,
        ReservationsModule,
        HealthModule,
        RealtimeModule,
        PaymentsModule,
        InsightsModule,
        NotificationsModule,
        ...testingModules,
      ],
      providers,
    };
  }
}
