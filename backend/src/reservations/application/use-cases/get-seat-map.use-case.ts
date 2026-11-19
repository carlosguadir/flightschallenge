import { Inject, Injectable } from '@nestjs/common';
import type { SeatMap } from '@flight/shared';

import { FLIGHT_QUERY_PORT } from '../../../catalog/application/ports/flight-query.port';
import type { FlightQueryPort } from '../../../catalog/application/ports/flight-query.port';
import { APP_CONFIG, type AppConfig } from '../../../config/config';
import { CLOCK } from '../../../shared-kernel/application/ports/clock.port';
import type { Clock } from '../../../shared-kernel/application/ports/clock.port';
import { SEAT_REPOSITORY, type SeatRepository } from '../ports/seat-repository.port';

export interface GetSeatMapQuery {
  flightId: string;
  sessionId: string;
}

@Injectable()
export class GetSeatMap {
  constructor(
    @Inject(FLIGHT_QUERY_PORT) private readonly flights: FlightQueryPort,
    @Inject(SEAT_REPOSITORY) private readonly seats: SeatRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(query: GetSeatMapQuery): Promise<SeatMap> {
    const [flight, seats] = await Promise.all([
      this.flights.getSummary(query.flightId),
      this.seats.listByFlight(query.flightId, query.sessionId),
    ]);

    return {
      flightId: flight.id,
      version: flight.version,
      status: flight.status,
      delayMinutes: flight.delayMinutes,
      soldOut: flight.soldOut,
      availableSeats: flight.availableSeats,
      serverTime: this.clock.now().toISOString(),
      holdTtlSeconds: this.config.seatHoldTtlSeconds,
      seats,
    };
  }
}
