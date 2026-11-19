import { Inject, Injectable } from '@nestjs/common';
import type { FlightSearchQuery, FlightSummary } from '@flight/shared';

import { FLIGHT_QUERY_PORT, type FlightQueryPort } from '../ports/flight-query.port';

@Injectable()
export class SearchFlights {
  constructor(@Inject(FLIGHT_QUERY_PORT) private readonly flights: FlightQueryPort) {}

  execute(query: FlightSearchQuery): Promise<FlightSummary[]> {
    return this.flights.search(query);
  }
}
