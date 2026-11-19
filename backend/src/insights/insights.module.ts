import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { METRICS_QUERY_PORT } from './application/ports/metrics-query.port';
import { GetMetrics } from './application/use-cases/get-metrics.use-case';
import { MetricsController } from './infrastructure/metrics.controller';
import { PostgresMetricsQueryAdapter } from './infrastructure/postgres-metrics-query.adapter';

/**
 * TODO another controller to possibbly only available for admins
 */
@Module({
  imports: [DatabaseModule],
  controllers: [MetricsController],
  providers: [
    PostgresMetricsQueryAdapter,
    { provide: METRICS_QUERY_PORT, useExisting: PostgresMetricsQueryAdapter },
    GetMetrics,
  ],
  exports: [GetMetrics],
})
export class InsightsModule {}
