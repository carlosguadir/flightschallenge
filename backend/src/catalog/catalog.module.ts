import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { FLIGHT_QUERY_PORT } from './application/ports/flight-query.port';
import { FLIGHT_STATE_PORT } from './application/ports/flight-state.port';
import { PostgresFlightQueryAdapter } from './infrastructure/postgres-flight-query.adapter';
import { PostgresFlightStateAdapter } from './infrastructure/postgres-flight-state.adapter';

@Module({
  imports: [DatabaseModule],
  providers: [
    PostgresFlightStateAdapter,
    PostgresFlightQueryAdapter,
    { provide: FLIGHT_STATE_PORT, useExisting: PostgresFlightStateAdapter },
    { provide: FLIGHT_QUERY_PORT, useExisting: PostgresFlightQueryAdapter },
  ],
  exports: [FLIGHT_STATE_PORT, FLIGHT_QUERY_PORT],
})
export class CatalogModule {}
