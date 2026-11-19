import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { SharedKernelModule } from '../shared-kernel/shared-kernel.module';
import { FLIGHT_QUERY_PORT } from './application/ports/flight-query.port';
import { FLIGHT_STATE_PORT } from './application/ports/flight-state.port';
import { ChangeFlightStatus } from './application/use-cases/change-flight-status.use-case';
import { GetFlightDetail } from './application/use-cases/get-flight-detail.use-case';
import { SearchFlights } from './application/use-cases/search-flights.use-case';
import { AdminFlightsController } from './infrastructure/admin-flights.controller';
import { FlightsController } from './infrastructure/flights.controller';
import { PostgresFlightQueryAdapter } from './infrastructure/postgres-flight-query.adapter';
import { PostgresFlightStateAdapter } from './infrastructure/postgres-flight-state.adapter';

@Module({
  imports: [DatabaseModule, SharedKernelModule],
  controllers: [FlightsController, AdminFlightsController],
  providers: [
    PostgresFlightStateAdapter,
    PostgresFlightQueryAdapter,
    { provide: FLIGHT_STATE_PORT, useExisting: PostgresFlightStateAdapter },
    { provide: FLIGHT_QUERY_PORT, useExisting: PostgresFlightQueryAdapter },
    SearchFlights,
    GetFlightDetail,
    ChangeFlightStatus,
  ],
  exports: [FLIGHT_STATE_PORT, FLIGHT_QUERY_PORT],
})
export class CatalogModule {}
